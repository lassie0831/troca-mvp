import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ENV, type Env } from '../config/env.js';
import { Database, type Queryable } from '../database/database.service.js';
import { LocationsService } from '../locations/locations.service.js';
import { InvalidImageError, processPhoto, thumbKey } from '../storage/image-processing.js';
import { StorageService } from '../storage/storage.service.js';
import type { CreateItemDto, UpdateItemDto } from './items.dto.js';
import { ITEM_FROM, ITEM_SELECT, ItemsPresenter, type ItemRow, type ItemStatus, type ItemView, type PhotoView } from './items.presenter.js';

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);

  constructor(
    private readonly db: Database,
    private readonly locations: LocationsService,
    private readonly storage: StorageService,
    private readonly presenter: ItemsPresenter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(userId: string, dto: CreateItemDto): Promise<ItemView> {
    const id = await this.db.tx(async (q) => {
      const anchor = await this.locations.resolveAnchor(q, userId, dto.latitude, dto.longitude);
      const row = await q.one<{ id: string }>(
        `INSERT INTO items (owner_id, location_id, title, description, price_cents, category, public_location)
         SELECT $1, ul.id, $3, $4, $5, $6, ul.public_location FROM user_locations ul WHERE ul.id = $2
         RETURNING id`,
        [userId, anchor.id, dto.title, dto.description ?? '', dto.priceCents, dto.category],
      );
      return row!.id;
    });
    return this.get(userId, id);
  }

  async listMine(userId: string): Promise<ItemView[]> {
    const rows = await this.db.many<ItemRow>(
      `SELECT ${ITEM_SELECT} FROM ${ITEM_FROM}
        WHERE i.owner_id = $1 AND i.status <> 'archived'
        ORDER BY i.created_at DESC`,
      [userId],
    );
    return Promise.all(rows.map((r) => this.presenter.item(r, userId)));
  }

  async get(viewerId: string, id: string): Promise<ItemView> {
    const row = await this.db.one<ItemRow>(`SELECT ${ITEM_SELECT} FROM ${ITEM_FROM} WHERE i.id = $1`, [id]);
    if (!row || (row.status === 'archived' && row.owner_id !== viewerId)) throw new NotFoundException('Item não encontrado');
    return this.presenter.item(row, viewerId);
  }

  async update(userId: string, id: string, dto: UpdateItemDto): Promise<ItemView> {
    await this.db.tx(async (q) => {
      await this.lockOwned(q, userId, id, ['active']);
      await q.exec(
        `UPDATE items SET
           title       = COALESCE($2, title),
           description = COALESCE($3, description),
           price_cents = COALESCE($4, price_cents),
           category    = COALESCE($5, category),
           updated_at  = now()
         WHERE id = $1`,
        [id, dto.title ?? null, dto.description ?? null, dto.priceCents ?? null, dto.category ?? null],
      );
    });
    return this.get(userId, id);
  }

  /** Removes an item from the marketplace. Open proposals involving it become "unavailable". */
  async archive(userId: string, id: string): Promise<void> {
    await this.db.tx(async (q) => {
      const status = await this.lockOwned(q, userId, id);
      if (status === 'archived') return;
      if (status === 'reserved') {
        throw new ConflictException('Este item está reservado em uma troca aceita. Cancele a troca antes de removê-lo.');
      }
      await q.exec(`UPDATE items SET status = 'archived', updated_at = now() WHERE id = $1`, [id]);
      await q.exec(
        `UPDATE proposals SET status = 'unavailable', closed_at = now()
          WHERE status = 'pending' AND (offered_item_id = $1 OR requested_item_id = $1)`,
        [id],
      );
    });
  }

  async addPhoto(userId: string, itemId: string, file: Buffer | undefined): Promise<PhotoView> {
    if (!file?.length) throw new BadRequestException('Envie a foto no campo "file" (multipart/form-data)');

    // Validate ownership/limit before the (relatively expensive) image processing.
    await this.assertCanAddPhoto(this.db, userId, itemId);

    let processed;
    try {
      processed = await processPhoto(file);
    } catch (err) {
      if (err instanceof InvalidImageError) throw new BadRequestException(err.message);
      throw err;
    }

    const key = `items/${itemId}/${randomUUID()}.webp`;
    await Promise.all([
      this.storage.put(key, processed.full, processed.contentType),
      this.storage.put(thumbKey(key), processed.thumb, processed.contentType),
    ]);

    try {
      const photo = await this.db.tx(async (q) => {
        await this.assertCanAddPhoto(q, userId, itemId, true);
        return q.one<{ id: string }>(
          `INSERT INTO item_photos (item_id, storage_key, position, width, height)
           SELECT $1, $2, COALESCE(MAX(position) + 1, 0), $3, $4 FROM item_photos WHERE item_id = $1
           RETURNING id`,
          [itemId, key, processed.width, processed.height],
        );
      });
      return this.presenter.photo({ id: photo!.id, key, width: processed.width, height: processed.height });
    } catch (err) {
      await this.storage.deleteMany([key, thumbKey(key)]).catch(() => undefined);
      throw err;
    }
  }

  async deletePhoto(userId: string, itemId: string, photoId: string): Promise<void> {
    const key = await this.db.tx(async (q) => {
      await this.lockOwned(q, userId, itemId);
      const row = await q.one<{ storage_key: string }>(
        `DELETE FROM item_photos WHERE id = $1 AND item_id = $2 RETURNING storage_key`,
        [photoId, itemId],
      );
      if (!row) throw new NotFoundException('Foto não encontrada');
      return row.storage_key;
    });
    await this.storage
      .deleteMany([key, thumbKey(key)])
      .catch((err) => this.logger.warn(`Could not delete objects for photo ${photoId}: ${err}`));
  }

  private async assertCanAddPhoto(q: Queryable, userId: string, itemId: string, lock = false): Promise<void> {
    if (lock) await this.lockOwned(q, userId, itemId, ['active', 'reserved']);
    else await this.findOwned(q, userId, itemId, ['active', 'reserved']);
    const count = await q.one<{ n: number }>(`SELECT count(*)::int AS n FROM item_photos WHERE item_id = $1`, [itemId]);
    if (count!.n >= this.env.MAX_PHOTOS_PER_ITEM) {
      throw new BadRequestException(`Limite de ${this.env.MAX_PHOTOS_PER_ITEM} fotos por item atingido`);
    }
  }

  private findOwned(q: Queryable, userId: string, id: string, allowed?: ItemStatus[]) {
    return this.checkOwned(q, userId, id, allowed, '');
  }

  /** Locks the item row (FOR UPDATE) and checks ownership / status. Must be called inside a transaction. */
  private lockOwned(q: Queryable, userId: string, id: string, allowed?: ItemStatus[]) {
    return this.checkOwned(q, userId, id, allowed, 'FOR UPDATE');
  }

  private async checkOwned(
    q: Queryable,
    userId: string,
    id: string,
    allowed: ItemStatus[] | undefined,
    lock: string,
  ): Promise<ItemStatus> {
    const row = await q.one<{ owner_id: string; status: ItemStatus }>(
      `SELECT owner_id, status FROM items WHERE id = $1 ${lock}`,
      [id],
    );
    if (!row || (row.status === 'archived' && row.owner_id !== userId)) throw new NotFoundException('Item não encontrado');
    if (row.owner_id !== userId) throw new ForbiddenException('Este item não é seu');
    if (allowed && !allowed.includes(row.status)) {
      throw new ConflictException(`Operação não permitida para item com status "${row.status}"`);
    }
    return row.status;
  }
}
