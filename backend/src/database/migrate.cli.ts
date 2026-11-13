import { loadEnv } from '../config/env.js';
import { createPool } from './database.service.js';
import { migrate } from './migrate.js';

const env = loadEnv();
const pool = createPool(env);
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `${applied.length} migration(s) applied.` : 'Database is up to date.');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
