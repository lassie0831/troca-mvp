import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import pg from 'pg';
import { ENV, type Env } from '../config/env.js';
import { Database, type Queryable } from '../database/database.service.js';
import { ItemsPresenter, type ItemStatus, type ItemSummary } from '../items/items.presenter.js';
import { isPriceCompatible } from '../matching/price.js';
import type { CreateProposalDto, ListProposalsQueryDto, ProposalStatus } from './proposals.dto.js';

interface ProposalRow {
  id: string;
  proposer_id: string;
  recipient_id: string;
  offered_item_id: string;
  requested_item_id: string;
  status: ProposalStatus;
  message: string | null;
  created_at: Date;
  responded_at: Date | null;
  closed_at: Date | null;
}

interface ProposalDetailRow extends ProposalRow {
  o_title: string;
  o_price: number;
  o_status: ItemStatus;
  o_cover: string | null;
  r_title: string;
  r_price: number;
  r_status: ItemStatus;
  r_cover: string | null;
  c_id: string;
  c_name: string;
  c_neighborhood: string;
  c_email: string;
}

export interface ProposalView {
  id: string;
  status: ProposalStatus;
  direction: 'sent' | 'received';
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  closedAt: string | null;
  offeredItem: ItemSummary;
  requestedItem: ItemSummary;
  counterpart: { id: string; name: string; neighborhood: string; email?: string };
  /** Actions the current user may perform now — lets the app render buttons without duplicating rules. */
  actions: ('accept' | 'decline' | 'cancel' | 'complete')[];
}

const DETAIL_SELECT = `
  SELECT p.*,
         oi.title AS o_title, oi.price_cents AS o_price, oi.status AS o_status,
         (SELECT storage_key FROM item_photos WHERE item_id = oi.id ORDER BY position LIMIT 1) AS o_cover,
         ri.title AS r_title, ri.price_cents AS r_price, ri.status AS r_status,
         (SELECT storage_key FROM item_photos WHERE item_id = ri.id ORDER BY position LIMIT 1) AS r_cover,
         cu.id AS c_id, cu.name AS c_name, cu.neighborhood AS c_neighborhood, cu.email AS c_email
    FROM proposals p
    JOIN items oi ON oi.id = p.offered_item_id
    JOIN items ri ON ri.id = p.requested_item_id
    JOIN users cu ON cu.id = CASE WHEN p.proposer_id = $1 THEN p.recipient_id ELSE p.proposer_id END`;

/**
 * Direct 1:1 trade proposals.
 *
 * State machine:
 *   pending  --accept (recipient)-->  accepted   (both items become "reserved"; other open proposals
 *                                                 involving either item become "unavailable")
 *   pending  --decline (recipient)--> declined
 *   pending  --cancel (proposer)----> cancelled
 *   accepted --complete (either)----> completed  (items become "traded")
 *   accepted --cancel (either)------> cancelled  (items return to "active")
 *
 * Lock ordering (deadlock avoidance): item rows are always locked first, ordered by id, then proposal rows.
 */
@Injectable()
export class ProposalsService {
  constructor(
    private readonly db: Database,
    private readonly presenter: ItemsPresenter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(userId: string, dto: CreateProposalDto): Promise<ProposalView> {
    if (dto.offeredItemId === dto.requestedItemId) throw new BadRequestException('Escolha itens diferentes');

    const id = await this.db.tx(async (q) => {
      const items = await this.lockItems(q, [dto.offeredItemId, dto.requestedItemId]);
      const offered = items.get(dto.offeredItemId);
      const requested = items.get(dto.requestedItemId);
      if (!offered || offered.owner_id !== userId || offered.status === 'archived') {
        throw new NotFoundException('Item oferecido não encontrado no seu inventário');
      }
      if (!requested || requested.status === 'archived') throw new NotFoundException('Item desejado não encontrado');
      if (requested.owner_id === userId) throw new BadRequestException('Você não pode propor troca com seu próprio item');
      if (offered.status !== 'active') throw new ConflictException('Seu item não está disponível para troca');
      if (requested.status !== 'active') throw new ConflictException('Este item não está mais disponível');
      if (!isPriceCompatible(offered.price_cents, requested.price_cents, this.env.PRICE_TOLERANCE_PCT)) {
        throw new BadRequestException(
          `Os valores estimados precisam estar dentro de ±${this.env.PRICE_TOLERANCE_PCT}% um do outro`,
        );
      }
      try {
        const row = await q.one<{ id: string }>(
          `INSERT INTO proposals (proposer_id, recipient_id, offered_item_id, requested_item_id, message)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [userId, requested.owner_id, offered.id, requested.id, dto.message ?? null],
        );
        return row!.id;
      } catch (err) {
        if (err instanceof pg.DatabaseError && err.code === '23505') {
          throw new ConflictException('Você já enviou uma proposta com estes itens');
        }
        throw err;
      }
    });
    return this.get(userId, id);
  }

  async list(userId: string, query: ListProposalsQueryDto): Promise<ProposalView[]> {
    const where = ['(p.proposer_id = $1 OR p.recipient_id = $1)'];
    if (query.box === 'sent') where.push('p.proposer_id = $1');
    if (query.box === 'received') where.push('p.recipient_id = $1');
    const params: unknown[] = [userId];
    if (query.status) {
      params.push(query.status);
      where.push(`p.status = $${params.length}`);
    }
    const rows = await this.db.many<ProposalDetailRow>(
      `${DETAIL_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT 200`,
      params,
    );
    return Promise.all(rows.map((r) => this.view(r, userId)));
  }

  async get(userId: string, id: string): Promise<ProposalView> {
    const row = await this.db.one<ProposalDetailRow>(
      `${DETAIL_SELECT} WHERE p.id = $2 AND (p.proposer_id = $1 OR p.recipient_id = $1)`,
      [userId, id],
    );
    if (!row) throw new NotFoundException('Proposta não encontrada');
    return this.view(row, userId);
  }

  accept(userId: string, id: string): Promise<ProposalView> {
    return this.transition(userId, id, async (q, p, items) => {
      this.assertRole(p, userId, 'recipient');
      this.assertStatus(p, ['pending']);
      for (const item of items.values()) {
        if (item.status !== 'active') throw new ConflictException('Um dos itens não está mais disponível');
      }
      const itemIds = [p.offered_item_id, p.requested_item_id];
      await q.exec(`UPDATE proposals SET status = 'accepted', responded_at = now() WHERE id = $1`, [p.id]);
      await q.exec(`UPDATE items SET status = 'reserved', updated_at = now() WHERE id = ANY($1::uuid[])`, [itemIds]);
      await q.exec(
        `UPDATE proposals SET status = 'unavailable', closed_at = now()
          WHERE status = 'pending' AND id <> $1
            AND (offered_item_id = ANY($2::uuid[]) OR requested_item_id = ANY($2::uuid[]))`,
        [p.id, itemIds],
      );
    });
  }

  decline(userId: string, id: string): Promise<ProposalView> {
    return this.transition(userId, id, async (q, p) => {
      this.assertRole(p, userId, 'recipient');
      this.assertStatus(p, ['pending']);
      await q.exec(`UPDATE proposals SET status = 'declined', responded_at = now(), closed_at = now() WHERE id = $1`, [p.id]);
    });
  }

  cancel(userId: string, id: string): Promise<ProposalView> {
    return this.transition(userId, id, async (q, p) => {
      this.assertStatus(p, ['pending', 'accepted']);
      if (p.status === 'pending') this.assertRole(p, userId, 'proposer');
      await q.exec(`UPDATE proposals SET status = 'cancelled', closed_at = now() WHERE id = $1`, [p.id]);
      if (p.status === 'accepted') {
        await q.exec(
          `UPDATE items SET status = 'active', updated_at = now() WHERE id = ANY($1::uuid[]) AND status = 'reserved'`,
          [[p.offered_item_id, p.requested_item_id]],
        );
      }
    });
  }

  complete(userId: string, id: string): Promise<ProposalView> {
    return this.transition(userId, id, async (q, p) => {
      this.assertStatus(p, ['accepted']);
      await q.exec(`UPDATE proposals SET status = 'completed', closed_at = now() WHERE id = $1`, [p.id]);
      await q.exec(`UPDATE items SET status = 'traded', updated_at = now() WHERE id = ANY($1::uuid[])`, [
        [p.offered_item_id, p.requested_item_id],
      ]);
    });
  }

  // ------------------------------------------------------------------ helpers

  private async transition(
    userId: string,
    id: string,
    apply: (q: Queryable, p: ProposalRow, items: Map<string, LockedItem>) => Promise<void>,
  ): Promise<ProposalView> {
    await this.db.tx(async (q) => {
      // Read item ids without locking, lock items, then lock and re-read the proposal (see lock ordering).
      const ref = await q.one<Pick<ProposalRow, 'offered_item_id' | 'requested_item_id'>>(
        `SELECT offered_item_id, requested_item_id FROM proposals
          WHERE id = $1 AND (proposer_id = $2 OR recipient_id = $2)`,
        [id, userId],
      );
      if (!ref) throw new NotFoundException('Proposta não encontrada');
      const items = await this.lockItems(q, [ref.offered_item_id, ref.requested_item_id]);
      const p = await q.one<ProposalRow>(`SELECT * FROM proposals WHERE id = $1 FOR UPDATE`, [id]);
      await apply(q, p!, items);
    });
    return this.get(userId, id);
  }

  private async lockItems(q: Queryable, ids: string[]): Promise<Map<string, LockedItem>> {
    const rows = await q.many<LockedItem>(
      `SELECT id, owner_id, status, price_cents FROM items WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [ids],
    );
    return new Map(rows.map((r) => [r.id, r]));
  }

  private assertRole(p: ProposalRow, userId: string, role: 'proposer' | 'recipient'): void {
    const ok = role === 'proposer' ? p.proposer_id === userId : p.recipient_id === userId;
    if (!ok) {
      throw new ForbiddenException(
        role === 'recipient' ? 'Apenas quem recebeu a proposta pode fazer isso' : 'Apenas quem enviou a proposta pode fazer isso',
      );
    }
  }

  private assertStatus(p: ProposalRow, allowed: ProposalStatus[]): void {
    if (!allowed.includes(p.status)) throw new ConflictException(`A proposta já está "${p.status}"`);
  }

  private async view(r: ProposalDetailRow, userId: string): Promise<ProposalView> {
    const direction = r.proposer_id === userId ? 'sent' : 'received';
    const actions: ProposalView['actions'] = [];
    if (r.status === 'pending') actions.push(...(direction === 'received' ? (['accept', 'decline'] as const) : (['cancel'] as const)));
    if (r.status === 'accepted') actions.push('complete', 'cancel');

    // Contact details are shared only after both parties agreed to the trade.
    const shareContact = r.status === 'accepted' || r.status === 'completed';
    const [offeredItem, requestedItem] = await Promise.all([
      this.presenter.summary({ id: r.offered_item_id, title: r.o_title, price_cents: r.o_price, status: r.o_status, cover_key: r.o_cover }),
      this.presenter.summary({ id: r.requested_item_id, title: r.r_title, price_cents: r.r_price, status: r.r_status, cover_key: r.r_cover }),
    ]);
    return {
      id: r.id,
      status: r.status,
      direction,
      message: r.message,
      createdAt: r.created_at.toISOString(),
      respondedAt: r.responded_at?.toISOString() ?? null,
      closedAt: r.closed_at?.toISOString() ?? null,
      offeredItem,
      requestedItem,
      counterpart: {
        id: r.c_id,
        name: shareContact ? r.c_name : r.c_name.split(' ')[0]!,
        neighborhood: r.c_neighborhood,
        ...(shareContact ? { email: r.c_email } : {}),
      },
      actions,
    };
  }
}

interface LockedItem {
  id: string;
  owner_id: string;
  status: ItemStatus;
  price_cents: number;
}
