import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPgliteDb, runPgliteMigrations, type PgliteDbHandle } from '../src/db/pglite.js';
import { MIGRATIONS_DIR } from '../src/db/migrate.js';

// SPEC-2026-10-12-memory AC-23 + desktop NFR: the memory indexes (HNSW on the
// embedding, GIN on the generated tsvector) must exist and work on PGlite too.
describe('memory schema on PGlite', () => {
  let dataDir: string;
  let handle: PgliteDbHandle;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'devdigest-mem-pglite-'));
    handle = await createPgliteDb(dataDir);
    await runPgliteMigrations(handle.pg, MIGRATIONS_DIR);
  });
  afterAll(async () => {
    await handle?.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('creates the HNSW and GIN memory indexes', async () => {
    const { rows } = await handle.pg.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'memory'`,
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toContain('memory_embedding_hnsw');
    expect(names).toContain('memory_tsv_gin');
    expect(names).toContain('memory_ws_repo_idx');
  });

  it('full-text matches through the generated content_tsv column', async () => {
    const { rows: ws } = await handle.pg.query<{ id: string }>(
      `INSERT INTO workspaces (name) VALUES ('w-mem') RETURNING id`,
    );
    await handle.pg.query(
      `INSERT INTO memory (workspace_id, scope, kind, content) VALUES ($1, 'global', 'fact', $2)`,
      [ws[0]!.id, 'bucketKey() must include the API version prefix'],
    );
    const { rows } = await handle.pg.query<{ content: string }>(
      `SELECT content FROM memory WHERE content_tsv @@ plainto_tsquery('english', 'bucketKey version')`,
    );
    expect(rows).toHaveLength(1);
  });

  it('memory_links allows exactly one of agent_id / skill_id', async () => {
    const { rows: m } = await handle.pg.query<{ id: string }>(`SELECT id FROM memory LIMIT 1`);
    await expect(
      handle.pg.query(`INSERT INTO memory_links (memory_id) VALUES ($1)`, [m[0]!.id]),
    ).rejects.toThrow();
  });
  it('has the curation columns merged_into and kept_at', async () => {
    const { rows } = await handle.pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'memory'`,
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain('merged_into');
    expect(cols).toContain('kept_at');
  });
});
