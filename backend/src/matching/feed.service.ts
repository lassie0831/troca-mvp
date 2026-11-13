import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { ENV, type Env } from '../config/env.js';
import { Database } from '../database/database.service.js';
import { ITEM_FROM, ITEM_SELECT, ItemsPresenter, type ItemRow, type ItemView } from '../items/items.presenter.js';
import { roundDistanceKm } from '../locations/privacy.js';
import type { FeedQueryDto } from './feed.dto.js';
import { symmetricPriceWindow, type PriceWindow } from './price.js';

export const DEFAULT_RADIUS_KM = 10;

export interface FeedEntry extends ItemView {
  /** Distance rounded to 0.5 km, computed against the other item's PUBLIC (fuzzed) position. */
  distanceKm: number;
  /** True if I already have a pending proposal offering `myItem` for this item. */
  alreadyProposed: boolean;
}

export interface FeedResponse {
  myItem: { id: string; title: string; priceCents: number } | null;
  radiusKm: number;
  priceWindow: PriceWindow | null;
  items: FeedEntry[];
  nextCursor: string | null;
}

const isOffsetCursor = (v: Record<string, unknown>): v is { o: number } =>
  Number.isInteger(v.o) && (v.o as number) >= 0 && (v.o as number) <= 10_000;

@Injectable()
export class FeedService {
  constructor(
    private readonly db: Database,
    private readonly presenter: ItemsPresenter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async feed(userId: string, query: FeedQueryDto): Promise<FeedResponse> {
    const radiusKm = query.radiusKm ?? DEFAULT_RADIUS_KM;
    if (radiusKm > this.env.FEED_MAX_RADIUS_KM) {
      throw new BadRequestException(`radiusKm deve ser no máximo ${this.env.FEED_MAX_RADIUS_KM}`);
    }
    const limit = query.limit ?? 20;
    const offset = decodeCursor(query.cursor, isOffsetCursor)?.o ?? 0;

    const myItem = await this.db.one<{ id: string; title: string; price_cents: number; status: string }>(
      query.myItemId
        ? `SELECT id, title, price_cents, status FROM items WHERE id = $2 AND owner_id = $1`
        : `SELECT id, title, price_cents, status FROM items WHERE owner_id = $1 AND status = 'active'
            ORDER BY created_at DESC LIMIT 1`,
      query.myItemId ? [userId, query.myItemId] : [userId],
    );
    if (!myItem) {
      if (query.myItemId) throw new NotFoundException('Item não encontrado');
      // User has nothing to offer yet: the app shows an onboarding state ("cadastre um item").
      return { myItem: null, radiusKm, priceWindow: null, items: [], nextCursor: null };
    }
    if (myItem.status !== 'active') throw new BadRequestException('Escolha um item ativo para ver equivalências');

    const window = symmetricPriceWindow(myItem.price_cents, this.env.PRICE_TOLERANCE_PCT);

    // Origin = the exact position where MY item was registered (my own data).
    // Target  = the other item's PUBLIC position. Their exact position is never read here, so neither
    // the radius filter nor the displayed distance can be used to triangulate it.
    const rows = await this.db.many<ItemRow & { distance_m: number; already_proposed: boolean }>(
      `WITH origin AS (
         SELECT ul.exact_location AS g
           FROM items mi JOIN user_locations ul ON ul.id = mi.location_id
          WHERE mi.id = $2
       )
       SELECT ${ITEM_SELECT},
              ST_Distance(i.public_location, o.g) AS distance_m,
              EXISTS (
                SELECT 1 FROM proposals p
                 WHERE p.offered_item_id = $2 AND p.requested_item_id = i.id AND p.status = 'pending'
              ) AS already_proposed
         FROM ${ITEM_FROM} CROSS JOIN origin o
        WHERE i.status = 'active'
          AND i.owner_id <> $1
          AND i.price_cents BETWEEN $3 AND $4
          AND ST_DWithin(i.public_location, o.g, $5)
        ORDER BY distance_m, i.id
        LIMIT $6 OFFSET $7`,
      [userId, myItem.id, window.minCents, window.maxCents, radiusKm * 1000, limit + 1, offset],
    );

    const page = rows.slice(0, limit);
    const items = await Promise.all(
      page.map(async (r) => ({
        ...(await this.presenter.item(r, userId)),
        distanceKm: roundDistanceKm(r.distance_m),
        alreadyProposed: r.already_proposed,
      })),
    );

    return {
      myItem: { id: myItem.id, title: myItem.title, priceCents: myItem.price_cents },
      radiusKm,
      priceWindow: window,
      items,
      nextCursor: rows.length > limit ? encodeCursor({ o: offset + limit }) : null,
    };
  }
}
