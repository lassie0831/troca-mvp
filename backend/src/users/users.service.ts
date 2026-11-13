import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Database } from '../database/database.service.js';
import { thumbKey } from '../storage/image-processing.js';
import { StorageService } from '../storage/storage.service.js';
import type { UpdateMeDto } from './users.dto.js';
import { toUserView, USER_COLUMNS, type UserRow, type UserView } from './users.types.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  async me(userId: string): Promise<UserView> {
    const row = await this.db.one<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [userId]);
    if (!row) throw new NotFoundException();
    return toUserView(row);
  }

  async update(userId: string, dto: UpdateMeDto): Promise<UserView> {
    const row = await this.db.one<UserRow>(
      `UPDATE users SET name = COALESCE($2, name), neighborhood = COALESCE($3, neighborhood), updated_at = now()
        WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      [userId, dto.name ?? null, dto.neighborhood ?? null],
    );
    if (!row) throw new NotFoundException();
    return toUserView(row);
  }

  /**
   * LGPD right to erasure: permanently deletes the account, its exact locations, items, photos,
   * proposals and sessions. Items of other users that were reserved in an accepted trade with this
   * user are released back to the feed.
   */
  async delete(userId: string): Promise<void> {
    const keys = await this.db.tx(async (q) => {
      await q.exec(
        `UPDATE items SET status = 'active', updated_at = now()
          WHERE status = 'reserved' AND id IN (
            SELECT CASE WHEN p.proposer_id = $1 THEN p.requested_item_id ELSE p.offered_item_id END
              FROM proposals p
             WHERE p.status = 'accepted' AND (p.proposer_id = $1 OR p.recipient_id = $1))`,
        [userId],
      );
      const photos = await q.many<{ storage_key: string }>(
        `SELECT p.storage_key FROM item_photos p JOIN items i ON i.id = p.item_id WHERE i.owner_id = $1`,
        [userId],
      );
      await q.exec(`DELETE FROM users WHERE id = $1`, [userId]); // cascades to everything else
      return photos.flatMap((p) => [p.storage_key, thumbKey(p.storage_key)]);
    });
    await this.storage
      .deleteMany(keys)
      .catch((err) => this.logger.error(`Account ${userId} deleted but ${keys.length} objects could not be removed: ${err}`));
  }
}
