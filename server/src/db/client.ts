import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { schema } from './schema.js';

/** Driver-agnostic Drizzle client: postgres-js (server) or PGlite (desktop, see `./pglite.ts`). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** A `Db` or the transaction handle passed to a `db.transaction(async (tx) => ...)` callback, so a
 *  service can run several repositories' writes inside one transaction. */
export type DbExecutor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export interface DbHandle {
  db: Db;
  close: () => Promise<void>;
}

export interface PostgresDbHandle extends DbHandle {
  sql: postgres.Sql;
}

/**
 * Create a Drizzle client over postgres-js. Used by the app (one shared handle)
 * and by the Testcontainers harness (per-test handle).
 */
export function createDb(databaseUrl: string, opts?: { max?: number }): PostgresDbHandle {
  const sql = postgres(databaseUrl, { max: opts?.max ?? 10 });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
