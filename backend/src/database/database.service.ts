import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { ENV, type Env } from '../config/env.js';

/** Anything that can run a query: the pool or a client inside a transaction. */
export interface Queryable {
  many<T>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T>(sql: string, params?: unknown[]): Promise<T | null>;
  exec(sql: string, params?: unknown[]): Promise<number>;
}

class Executor implements Queryable {
  constructor(private readonly target: pg.Pool | pg.PoolClient) {}

  async many<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.target.query(sql, params);
    return res.rows as T[];
  }

  async one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.many<T>(sql, params);
    return rows[0] ?? null;
  }

  async exec(sql: string, params: unknown[] = []): Promise<number> {
    const res = await this.target.query(sql, params);
    return res.rowCount ?? 0;
  }
}

export function createPool(env: Pick<Env, 'DATABASE_URL' | 'DATABASE_POOL_MAX' | 'DATABASE_SSL'>): pg.Pool {
  return new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  });
}

@Injectable()
export class Database implements Queryable, OnModuleDestroy {
  readonly pool: pg.Pool;
  private readonly executor: Executor;

  constructor(@Inject(ENV) env: Env) {
    this.pool = createPool(env);
    this.executor = new Executor(this.pool);
  }

  many<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.executor.many<T>(sql, params);
  }

  one<T>(sql: string, params?: unknown[]): Promise<T | null> {
    return this.executor.one<T>(sql, params);
  }

  exec(sql: string, params?: unknown[]): Promise<number> {
    return this.executor.exec(sql, params);
  }

  /** Runs `fn` inside a transaction; commits on success, rolls back on any error. */
  async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new Executor(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
