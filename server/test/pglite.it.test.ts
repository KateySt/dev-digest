import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { createPgliteDb, runPgliteMigrations, type PgliteDbHandle } from '../src/db/pglite.js';
import { MIGRATIONS_DIR } from '../src/db/migrate.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { schema } from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

// Desktop DB path (src/desktop.ts): embedded PGlite + pgvector, no Docker needed.
// Named *.it.test.ts because it is DB-backed (unit runs exclude it).
describe('PGlite (desktop DB)', () => {
  let dataDir: string;
  let handle: PgliteDbHandle;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'devdigest-pglite-'));
    handle = await createPgliteDb(dataDir);
  });
  afterAll(async () => {
    await handle?.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('applies every journaled migration once, then is a no-op', async () => {
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'));
    expect(await runPgliteMigrations(handle.pg, MIGRATIONS_DIR)).toBe(journal.entries.length);
    expect(await runPgliteMigrations(handle.pg, MIGRATIONS_DIR)).toBe(0);
  });

  // Catches a migration file that exists but never made it into the journal
  // (how agents.attached_doc_paths went missing before 0022).
  it('migrated DB has every column the Drizzle schema declares', async () => {
    const { rows } = await handle.pg.query<{ t: string; c: string }>(
      `SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    const have = new Set(rows.map((r) => `${r.t}.${r.c}`));
    const missing = Object.values(schema)
      .filter((v): v is PgTable => v instanceof PgTable)
      .flatMap((table) => {
        const cfg = getTableConfig(table);
        return cfg.columns.map((col) => `${cfg.name}.${col.name}`);
      })
      .filter((key) => !have.has(key));
    expect(missing).toEqual([]);
  });

  it('seeds idempotently and serves DB-backed routes', async () => {
    await seed(handle.db);
    await seed(handle.db);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const agents = await app.inject({ method: 'GET', url: '/agents' });
    expect(agents.statusCode).toBe(200);
    expect(agents.json().length).toBeGreaterThan(0);
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.json()).toEqual({ ready: true });
    await app.close();
  });

  it('survives close + reopen of the same data dir', async () => {
    await handle.close();
    handle = await createPgliteDb(dataDir);
    const { rows } = await handle.pg.query<{ n: number }>('SELECT count(*)::int AS n FROM agents');
    expect(rows[0]!.n).toBeGreaterThan(0);
  });
});
