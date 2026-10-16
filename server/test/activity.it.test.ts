import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createPgliteDb, runPgliteMigrations, type PgliteDbHandle } from '../src/db/pglite.js';
import { MIGRATIONS_DIR } from '../src/db/migrate.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

// GET /activity against a real (embedded PGlite) DB — no Docker needed.
describe('activity (PGlite)', () => {
  let dataDir: string;
  let handle: PgliteDbHandle;
  let app: FastifyInstance;
  let workspaceId: string;
  const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'devdigest-activity-'));
    handle = await createPgliteDb(dataDir);
    await runPgliteMigrations(handle.pg, MIGRATIONS_DIR);
    await seed(handle.db);
    app = await buildApp({ config, db: handle.db, overrides: { git: new MockGitClient(), github: new MockGitHubClient() } });
    workspaceId = (await app.container.auth.currentWorkspace({})).id;
  });
  afterAll(async () => {
    await app?.close();
    await handle?.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const get = async () => (await app.inject({ method: 'GET', url: '/activity' })).json();

  it('counts queued + running review runs and running eval suites only', async () => {
    const before = await get();
    await handle.db.insert(t.agentRuns).values([
      { workspaceId, status: 'queued' },
      { workspaceId, status: 'running' },
      { workspaceId, status: 'done' },
      { workspaceId, status: 'failed' },
    ]);
    const [agent] = await handle.db.select({ id: t.agents.id }).from(t.agents).limit(1);
    await handle.db.insert(t.evalSuiteRuns).values([
      { workspaceId, agentId: agent!.id, agentVersion: 1, status: 'running', casesTotal: 3 },
      { workspaceId, agentId: agent!.id, agentVersion: 1, status: 'completed', casesTotal: 3 },
    ]);

    const after = await get();
    expect(after.reviews_running - before.reviews_running).toBe(2);
    expect(after.evals_running - before.evals_running).toBe(1);
  });

  it('ignores another workspace', async () => {
    const before = await get();
    const [other] = await handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    await handle.db.insert(t.agentRuns).values({ workspaceId: other!.id, status: 'running' });
    expect((await get()).reviews_running).toBe(before.reviews_running);
  });
});
