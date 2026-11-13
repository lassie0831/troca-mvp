/**
 * End-to-end tests: boots the real application against a real PostgreSQL + PostGIS database
 * and exercises the HTTP API.
 *
 * Requires DATABASE_URL pointing to a DISPOSABLE database whose name contains "test"
 * (the public schema is dropped and recreated). Run with: npm run test:e2e
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import sharp from 'sharp';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp } from '../../src/app.factory.js';
import { loadEnv } from '../../src/config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = !DATABASE_URL ? 'DATABASE_URL not set' : !/test/i.test(new URL(DATABASE_URL).pathname) ? 'database name must contain "test"' : false;

// Reference points in São Paulo.
const PAULISTA = { latitude: -23.5617, longitude: -46.656 };
const NEAR_PAULISTA = { latitude: -23.5735, longitude: -46.6445 }; // ~1.8 km away
const FAR_AWAY = { latitude: -23.3, longitude: -46.75 }; // ~30 km away

let app: NestExpressApplication;
let base: string;
let db: pg.Pool;
let uploadsDir: string;

interface Res<T = any> {
  status: number;
  body: T;
}

async function api<T = any>(method: string, url: string, opts: { token?: string; body?: unknown; form?: FormData } = {}): Promise<Res<T>> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: FormData | string | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(base + url, { method, headers, body });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

async function register(name: string, email: string) {
  const res = await api('POST', '/v1/auth/register', {
    body: { name, email, password: 'senha-forte-123', neighborhood: 'Bela Vista' },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body as { accessToken: string; refreshToken: string; user: { id: string } };
}

async function createItem(token: string, data: { title: string; priceCents: number; latitude: number; longitude: number }) {
  const res = await api('POST', '/v1/items', { token, body: { category: 'moveis', description: 'Em bom estado', ...data } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body as { id: string; [k: string]: unknown };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

describe('API (e2e)', { skip }, () => {
  before(async () => {
    db = new pg.Pool({ connectionString: DATABASE_URL });
    await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');

    uploadsDir = await mkdtemp(path.join(tmpdir(), 'troca-e2e-'));
    const port = await freePort();
    Object.assign(process.env, {
      NODE_ENV: 'test',
      API_PUBLIC_URL: `http://127.0.0.1:${port}`,
      JWT_ACCESS_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
      STORAGE_DRIVER: 'local',
      LOCAL_STORAGE_DIR: uploadsDir,
      MIGRATE_ON_START: 'true',
      RATE_LIMIT_PER_MINUTE: '100000',
      AUTH_RATE_LIMIT_PER_MINUTE: '100000',
    });
    app = await createApp(loadEnv(), { logger: ['error'] });
    await app.listen(port, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await app?.close();
    await db?.end();
    if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
  });

  let alice: Awaited<ReturnType<typeof register>>;
  let bob: Awaited<ReturnType<typeof register>>;
  let carol: Awaited<ReturnType<typeof register>>;
  let aliceSofa: { id: string; isMine?: unknown };

  let bobTable: { id: string };
  let bobCheap: { id: string };
  let carolChair: { id: string };

  it('health check', async () => {
    const res = await api('GET', '/health');
    assert.deepEqual(res.body, { status: 'ok', database: 'up' });
  });

  describe('auth', () => {
    it('registers users', async () => {
      alice = await register('Alice Souza', 'alice@example.com');
      bob = await register('Bob Lima', 'BOB@example.com ');
      carol = await register('Carol Dias', 'carol@example.com');
    });

    it('rejects duplicate e-mails (case-insensitive)', async () => {
      const res = await api('POST', '/v1/auth/register', {
        body: { name: 'Outra', email: 'Alice@Example.com', password: 'senha-forte-123', neighborhood: 'Centro' },
      });
      assert.equal(res.status, 409);
    });

    it('validates payloads and rejects unknown fields', async () => {
      const res = await api('POST', '/v1/auth/register', {
        body: { name: 'X', email: 'nope', password: '1', neighborhood: 'Centro', isAdmin: true },
      });
      assert.equal(res.status, 400);
    });

    it('logs in and rejects a wrong password', async () => {
      assert.equal((await api('POST', '/v1/auth/login', { body: { email: 'alice@example.com', password: 'errada-123' } })).status, 401);
      const ok = await api('POST', '/v1/auth/login', { body: { email: 'alice@example.com', password: 'senha-forte-123' } });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.user.email, 'alice@example.com');
    });

    it('requires a token on protected routes', async () => {
      assert.equal((await api('GET', '/v1/me')).status, 401);
      assert.equal((await api('GET', '/v1/me', { token: 'garbage' })).status, 401);
      assert.equal((await api('GET', '/v1/me', { token: alice.accessToken })).body.name, 'Alice Souza');
    });

    it('rotates refresh tokens and revokes all sessions on reuse', async () => {
      const login = await api('POST', '/v1/auth/login', { body: { email: 'bob@example.com', password: 'senha-forte-123' } });
      const first = login.body.refreshToken as string;
      const rotated = await api('POST', '/v1/auth/refresh', { body: { refreshToken: first } });
      assert.equal(rotated.status, 200);
      assert.notEqual(rotated.body.refreshToken, first);

      // Replaying the old token = theft signal: it fails AND the rotated one is revoked too.
      assert.equal((await api('POST', '/v1/auth/refresh', { body: { refreshToken: first } })).status, 401);
      assert.equal((await api('POST', '/v1/auth/refresh', { body: { refreshToken: rotated.body.refreshToken } })).status, 401);
    });
  });

  describe('items & location privacy', () => {
    it('creates items without ever exposing coordinates', async () => {
      aliceSofa = await createItem(alice.accessToken, { title: 'Sofá 3 lugares', priceCents: 100_000, ...PAULISTA });
      const raw = JSON.stringify(aliceSofa);
      assert.doesNotMatch(raw, /latitude|longitude|location|-23\.5|-46\.6/);
      assert.equal(aliceSofa.isMine, true);
    });

    it('stores a fuzzed public point 200 m – 1 km away from the exact one', async () => {
      const { rows } = await db.query(
        `SELECT ST_Distance(ul.exact_location, ul.public_location) AS d,
                ST_Equals(i.public_location::geometry, ul.public_location::geometry) AS same
           FROM items i JOIN user_locations ul ON ul.id = i.location_id WHERE i.id = $1`,
        [aliceSofa.id],
      );
      assert.ok(rows[0].d >= 199 && rows[0].d <= 1001, `fuzz distance ${rows[0].d}`);
      assert.equal(rows[0].same, true);
    });

    it('reuses the same fuzzed anchor for items registered from the same place (anti-averaging)', async () => {
      await createItem(alice.accessToken, {
        title: 'Luminária de piso',
        priceCents: 10_000,
        latitude: PAULISTA.latitude + 0.0005, // ~55 m away – same home
        longitude: PAULISTA.longitude,
      });
      const { rows } = await db.query(
        `SELECT count(DISTINCT location_id)::int AS anchors FROM items WHERE owner_id = $1`,
        [alice.user.id],
      );
      assert.equal(rows[0].anchors, 1);
    });

    it('creates items for the other users', async () => {
      bobTable = await createItem(bob.accessToken, { title: 'Mesa de jantar', priceCents: 110_000, ...NEAR_PAULISTA });
      bobCheap = await createItem(bob.accessToken, { title: 'Cadeira simples', priceCents: 80_000, ...NEAR_PAULISTA });
      carolChair = await createItem(carol.accessToken, { title: 'Poltrona', priceCents: 100_000, ...FAR_AWAY });
    });

    it('validates item input', async () => {
      const res = await api('POST', '/v1/items', {
        token: alice.accessToken,
        body: { title: 'ok item', priceCents: 1000, category: 'inexistente', latitude: 200, longitude: 0 },
      });
      assert.equal(res.status, 400);
    });

    it('only the owner can edit', async () => {
      const res = await api('PATCH', `/v1/items/${aliceSofa.id}`, { token: bob.accessToken, body: { title: 'hack' } });
      assert.equal(res.status, 403);
      const ok = await api('PATCH', `/v1/items/${aliceSofa.id}`, { token: alice.accessToken, body: { description: 'Retrátil' } });
      assert.equal(ok.body.description, 'Retrátil');
    });
  });

  describe('photos', () => {
    it('uploads a photo, strips EXIF/GPS and serves it', async () => {
      const jpeg = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#a52' } })
        .jpeg()
        .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 42/1' } })
        .toBuffer();
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'sofa.jpg');
      const res = await api('POST', `/v1/items/${aliceSofa.id}/photos`, { token: alice.accessToken, form });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.width, 1600);

      const served = Buffer.from(await (await fetch(res.body.url)).arrayBuffer());
      const meta = await sharp(served).metadata();
      assert.equal(meta.format, 'webp');
      assert.equal(meta.exif, undefined);
      assert.equal((await fetch(res.body.thumbUrl)).status, 200);
    });

    it('rejects non-images and uploads to items of other users', async () => {
      const bad = new FormData();
      bad.append('file', new Blob(['not an image'], { type: 'image/jpeg' }), 'x.jpg');
      assert.equal((await api('POST', `/v1/items/${aliceSofa.id}/photos`, { token: alice.accessToken, form: bad })).status, 400);

      const img = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
      const other = new FormData();
      other.append('file', new Blob([new Uint8Array(img)], { type: 'image/png' }), 'x.png');
      assert.equal((await api('POST', `/v1/items/${aliceSofa.id}/photos`, { token: bob.accessToken, form: other })).status, 403);
    });
  });

  describe('equivalence feed', () => {
    it('returns symmetric price matches within the radius, with 0.5 km rounded distances', async () => {
      const res = await api('GET', `/v1/feed?myItemId=${aliceSofa.id}&radiusKm=5`, { token: alice.accessToken });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.priceWindow, { minCents: 83_334, maxCents: 120_000 });
      const ids = res.body.items.map((i: { id: string }) => i.id);
      assert.deepEqual(ids, [bobTable.id]); // bobCheap: price out of window; carolChair: too far; own items excluded
      const d = res.body.items[0].distanceKm;
      assert.ok(d >= 0.5 && d <= 5 && (d * 2) % 1 === 0, `distanceKm ${d}`);
      assert.doesNotMatch(JSON.stringify(res.body), /latitude|longitude|location/);
    });

    it('larger radius includes far items', async () => {
      const res = await api('GET', `/v1/feed?myItemId=${aliceSofa.id}&radiusKm=50`, { token: alice.accessToken });
      const ids = res.body.items.map((i: { id: string }) => i.id);
      assert.deepEqual(new Set(ids), new Set([bobTable.id, carolChair.id]));
    });

    it('is mutual: bob sees alice', async () => {
      const res = await api('GET', `/v1/feed?myItemId=${bobTable.id}&radiusKm=5`, { token: bob.accessToken });
      assert.deepEqual(res.body.items.map((i: { id: string }) => i.id), [aliceSofa.id]);
    });

    it('paginates', async () => {
      const p1 = await api('GET', `/v1/feed?myItemId=${aliceSofa.id}&radiusKm=50&limit=1`, { token: alice.accessToken });
      assert.equal(p1.body.items.length, 1);
      assert.ok(p1.body.nextCursor);
      const p2 = await api('GET', `/v1/feed?myItemId=${aliceSofa.id}&radiusKm=50&limit=1&cursor=${p1.body.nextCursor}`, {
        token: alice.accessToken,
      });
      assert.equal(p2.body.items.length, 1);
      assert.notEqual(p2.body.items[0].id, p1.body.items[0].id);
      assert.equal(p2.body.nextCursor, null);
    });

    it('validates the radius', async () => {
      assert.equal((await api('GET', `/v1/feed?radiusKm=0`, { token: alice.accessToken })).status, 400);
      assert.equal((await api('GET', `/v1/feed?radiusKm=51`, { token: alice.accessToken })).status, 400);
    });
  });

  describe('proposals', () => {
    let bobToAlice: string;
    let carolToAlice: string;

    it('creates proposals and enforces the rules', async () => {
      const res = await api('POST', '/v1/proposals', {
        token: bob.accessToken,
        body: { offeredItemId: bobTable.id, requestedItemId: aliceSofa.id, message: 'Topa?' },
      });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.status, 'pending');
      assert.equal(res.body.counterpart.email, undefined, 'contact hidden before acceptance');
      bobToAlice = res.body.id;

      const dup = await api('POST', '/v1/proposals', {
        token: bob.accessToken,
        body: { offeredItemId: bobTable.id, requestedItemId: aliceSofa.id },
      });
      assert.equal(dup.status, 409);

      const incompatible = await api('POST', '/v1/proposals', {
        token: bob.accessToken,
        body: { offeredItemId: bobCheap.id, requestedItemId: aliceSofa.id },
      });
      assert.equal(incompatible.status, 400);

      const notMine = await api('POST', '/v1/proposals', {
        token: bob.accessToken,
        body: { offeredItemId: carolChair.id, requestedItemId: aliceSofa.id },
      });
      assert.equal(notMine.status, 404);

      const carolRes = await api('POST', '/v1/proposals', {
        token: carol.accessToken,
        body: { offeredItemId: carolChair.id, requestedItemId: aliceSofa.id },
      });
      assert.equal(carolRes.status, 201);
      carolToAlice = carolRes.body.id;
    });

    it('feed flags items already proposed', async () => {
      const res = await api('GET', `/v1/feed?myItemId=${bobTable.id}&radiusKm=5`, { token: bob.accessToken });
      assert.equal(res.body.items[0].alreadyProposed, true);
    });

    it('lists received proposals with available actions', async () => {
      const res = await api('GET', '/v1/proposals?box=received&status=pending', { token: alice.accessToken });
      assert.equal(res.body.length, 2);
      assert.deepEqual(res.body[0].actions, ['accept', 'decline']);
    });

    it('enforces who can do what', async () => {
      assert.equal((await api('POST', `/v1/proposals/${bobToAlice}/accept`, { token: bob.accessToken })).status, 403);
      assert.equal((await api('POST', `/v1/proposals/${bobToAlice}/cancel`, { token: alice.accessToken })).status, 403);
      assert.equal((await api('GET', `/v1/proposals/${bobToAlice}`, { token: carol.accessToken })).status, 404);
    });

    it('accepting reserves both items, shares contacts and closes competing proposals', async () => {
      const res = await api('POST', `/v1/proposals/${bobToAlice}/accept`, { token: alice.accessToken });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.status, 'accepted');
      assert.equal(res.body.counterpart.email, 'bob@example.com');
      assert.equal(res.body.offeredItem.status, 'reserved');
      assert.equal(res.body.requestedItem.status, 'reserved');

      const carolView = await api('GET', `/v1/proposals/${carolToAlice}`, { token: carol.accessToken });
      assert.equal(carolView.body.status, 'unavailable');

      const feed = await api('GET', `/v1/feed?myItemId=${carolChair.id}&radiusKm=50`, { token: carol.accessToken });
      assert.equal(feed.body.items.length, 0, 'reserved items leave the feed');
    });

    it('cannot archive a reserved item', async () => {
      assert.equal((await api('DELETE', `/v1/items/${aliceSofa.id}`, { token: alice.accessToken })).status, 409);
    });

    it('cancelling an accepted trade returns items to the feed', async () => {
      const res = await api('POST', `/v1/proposals/${bobToAlice}/cancel`, { token: bob.accessToken });
      assert.equal(res.body.status, 'cancelled');
      assert.equal(res.body.offeredItem.status, 'active');
      assert.equal(res.body.requestedItem.status, 'active');
    });

    it('completing a trade marks both items as traded', async () => {
      const p = await api('POST', '/v1/proposals', {
        token: bob.accessToken,
        body: { offeredItemId: bobTable.id, requestedItemId: aliceSofa.id },
      });
      await api('POST', `/v1/proposals/${p.body.id}/accept`, { token: alice.accessToken });
      const done = await api('POST', `/v1/proposals/${p.body.id}/complete`, { token: bob.accessToken });
      assert.equal(done.body.status, 'completed');
      assert.equal(done.body.offeredItem.status, 'traded');
      assert.deepEqual(done.body.actions, []);
    });

    it('two concurrent accepts on the same item: exactly one wins', async () => {
      const dave = await register('Dave Rocha', 'dave@example.com');
      const target = await createItem(alice.accessToken, { title: 'Bicicleta aro 29', priceCents: 50_000, ...PAULISTA });
      const bobBike = await createItem(bob.accessToken, { title: 'Patinete elétrico', priceCents: 50_000, ...NEAR_PAULISTA });
      const daveBike = await createItem(dave.accessToken, { title: 'Skate elétrico', priceCents: 50_000, ...NEAR_PAULISTA });
      const p1 = await api('POST', '/v1/proposals', { token: bob.accessToken, body: { offeredItemId: bobBike.id, requestedItemId: target.id } });
      const p2 = await api('POST', '/v1/proposals', { token: dave.accessToken, body: { offeredItemId: daveBike.id, requestedItemId: target.id } });

      const results = await Promise.all([
        api('POST', `/v1/proposals/${p1.body.id}/accept`, { token: alice.accessToken }),
        api('POST', `/v1/proposals/${p2.body.id}/accept`, { token: alice.accessToken }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    });
  });

  describe('account deletion (LGPD)', () => {
    it('deletes the account, its data and invalidates tokens', async () => {
      assert.equal((await api('DELETE', '/v1/me', { token: carol.accessToken })).status, 204);
      assert.equal((await api('GET', '/v1/me', { token: carol.accessToken })).status, 401);
      const { rows } = await db.query(
        `SELECT (SELECT count(*) FROM items WHERE owner_id = $1)::int AS items,
                (SELECT count(*) FROM user_locations WHERE user_id = $1)::int AS locations`,
        [carol.user.id],
      );
      assert.deepEqual(rows[0], { items: 0, locations: 0 });
      assert.equal((await api('GET', `/v1/items/${carolChair.id}`, { token: alice.accessToken })).status, 404);
    });
  });
});
