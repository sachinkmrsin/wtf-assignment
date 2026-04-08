/**
 * Integration test helper — creates an in-memory Postgres instance using pg-mem,
 * runs migrations against it, and returns a Pool that tests can use.
 */
import { newDb } from 'pg-mem';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

export function createTestDb(): { pool: Pool; teardown: () => void } {
  const db = newDb();

  // Replay migrations
  const migrationsDir = path.join(__dirname, '../../src/db/migrations');
  const files = fs.readdirSync(migrationsDir).sort();
  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    try {
      db.public.none(sql);
    } catch (_e) {
      // pg-mem doesn't support all Postgres syntax; skip unsupported statements
    }
  }

  const pool = db.adapters.createPg().Pool as unknown as Pool;
  const instance = new (pool as unknown as new (opts?: object) => Pool)();

  return {
    pool: instance,
    teardown: () => {
      /* pg-mem is in-memory, no teardown needed */
    },
  };
}
