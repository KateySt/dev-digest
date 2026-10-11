import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { schema } from './schema.js';
import type { Db, DbHandle } from './client.js';

export interface PgliteDbHandle extends DbHandle {
  pg: PGlite;
}

/**
 * Embedded Postgres (PGlite + pgvector) for the desktop app — no Docker.
 * PGlite allows ONE process per data dir, so the desktop entry owns the only handle.
 */
export async function createPgliteDb(dataDir: string): Promise<PgliteDbHandle> {
  const pg = await PGlite.create({ dataDir, extensions: { vector } });
  const db: Db = drizzle(pg, { schema });
  return { db, pg, close: () => pg.close() };
}

/**
 * Apply the journaled migrations to a PGlite database. Idempotent.
 *
 * Not drizzle's `pglite/migrator`: it sends each chunk as a prepared statement,
 * which rejects multi-statement chunks — and 0013_fine_jamie_braddock.sql has
 * three ALTERs without `--> statement-breakpoint` (committed migrations are
 * never edited). `exec` uses the simple query protocol, which accepts them.
 * Bookkeeping matches drizzle's migrator (`drizzle.__drizzle_migrations`,
 * applied when `created_at` < the migration's folderMillis).
 */
export async function runPgliteMigrations(pg: PGlite, migrationsFolder: string): Promise<number> {
  const migrations = readMigrationFiles({ migrationsFolder });
  await pg.exec(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE SCHEMA IF NOT EXISTS drizzle;
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
  `);
  const { rows } = await pg.query<{ created_at: string }>(
    'SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1',
  );
  const lastApplied = rows[0] ? Number(rows[0].created_at) : -Infinity;
  const pending = migrations.filter((m) => m.folderMillis > lastApplied);
  await pg.transaction(async (tx) => {
    for (const m of pending) {
      for (const stmt of m.sql) await tx.exec(stmt);
      await tx.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [
        m.hash,
        m.folderMillis,
      ]);
    }
  });
  return pending.length;
}
