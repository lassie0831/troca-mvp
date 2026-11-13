import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import type { Queryable } from '../database/database.service.js';
import { sampleFuzzOffset } from './privacy.js';

export interface LocationAnchor {
  id: string;
}

@Injectable()
export class LocationsService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /**
   * Returns the location anchor to attach to a new item registered at (lat, lng).
   *
   * If the same user already has an anchor within LOCATION_ANCHOR_REUSE_M, it is reused together
   * with its already-persisted public point. Otherwise a new anchor is created with a fresh random
   * displacement (computed with ST_Project on the WGS84 spheroid).
   *
   * Must run inside a transaction; it takes a per-user advisory lock so two concurrent item
   * registrations from the same place cannot create two independently-fuzzed anchors.
   */
  async resolveAnchor(q: Queryable, userId: string, lat: number, lng: number): Promise<LocationAnchor> {
    await q.exec(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`user_locations:${userId}`]);

    const point = `ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography`;
    const existing = await q.one<LocationAnchor>(
      `SELECT id FROM user_locations
        WHERE user_id = $1 AND ST_DWithin(exact_location, ${point}, $4)
        ORDER BY ST_Distance(exact_location, ${point})
        LIMIT 1`,
      [userId, lat, lng, this.env.LOCATION_ANCHOR_REUSE_M],
    );
    if (existing) return existing;

    const { distanceM, bearingDeg } = sampleFuzzOffset(this.env.LOCATION_FUZZ_MIN_M, this.env.LOCATION_FUZZ_MAX_M);
    const created = await q.one<LocationAnchor>(
      `INSERT INTO user_locations (user_id, exact_location, public_location)
       VALUES ($1, ${point}, ST_Project(${point}, $4, radians($5)))
       RETURNING id`,
      [userId, lat, lng, distanceM, bearingDeg],
    );
    return created!;
  }
}
