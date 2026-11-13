import { Injectable } from '@nestjs/common';
import { thumbKey } from '../storage/image-processing.js';
import { StorageService } from '../storage/storage.service.js';

export type ItemStatus = 'active' | 'reserved' | 'traded' | 'archived';

/**
 * Columns selected for an item. Deliberately contains NO coordinates: neither the exact nor the
 * public position ever leaves the API — clients only receive a rounded distance.
 */
export const ITEM_SELECT = `
  i.id, i.owner_id, i.title, i.description, i.price_cents, i.category, i.status, i.created_at,
  u.name AS owner_name, u.neighborhood AS owner_neighborhood,
  COALESCE((
    SELECT json_agg(json_build_object('id', p.id, 'key', p.storage_key, 'width', p.width, 'height', p.height)
                    ORDER BY p.position)
      FROM item_photos p WHERE p.item_id = i.id
  ), '[]'::json) AS photos`;

export const ITEM_FROM = `items i JOIN users u ON u.id = i.owner_id`;

export interface ItemRow {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  price_cents: number;
  category: string;
  status: ItemStatus;
  created_at: Date;
  owner_name: string;
  owner_neighborhood: string;
  photos: { id: string; key: string; width: number; height: number }[];
}

export interface PhotoView {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

export interface ItemView {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  category: string;
  status: ItemStatus;
  createdAt: string;
  isMine: boolean;
  owner: { id: string; name: string; neighborhood: string };
  photos: PhotoView[];
}

export interface ItemSummary {
  id: string;
  title: string;
  priceCents: number;
  status: ItemStatus;
  thumbUrl: string | null;
}

@Injectable()
export class ItemsPresenter {
  constructor(private readonly storage: StorageService) {}

  async item(row: ItemRow, viewerId: string): Promise<ItemView> {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      priceCents: row.price_cents,
      category: row.category,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      isMine: row.owner_id === viewerId,
      // Only the first name is shown publicly.
      owner: { id: row.owner_id, name: row.owner_name.split(' ')[0]!, neighborhood: row.owner_neighborhood },
      photos: await Promise.all(row.photos.map((p) => this.photo(p))),
    };
  }

  async photo(p: { id: string; key: string; width: number; height: number }): Promise<PhotoView> {
    const [url, thumbUrl] = await Promise.all([this.storage.url(p.key), this.storage.url(thumbKey(p.key))]);
    return { id: p.id, url, thumbUrl, width: p.width, height: p.height };
  }

  async summary(s: { id: string; title: string; price_cents: number; status: ItemStatus; cover_key: string | null }): Promise<ItemSummary> {
    return {
      id: s.id,
      title: s.title,
      priceCents: s.price_cents,
      status: s.status,
      thumbUrl: s.cover_key ? await this.storage.url(thumbKey(s.cover_key)) : null,
    };
  }
}
