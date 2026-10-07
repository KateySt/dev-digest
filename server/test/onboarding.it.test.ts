import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { GENERATE_JOB_KIND } from '../src/modules/onboarding/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('onboarding restart safety (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let orphanId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'tour-target',
        fullName: 'acme/tour-target',
        clonePath: '/mock/clone',
      })
      .returning();
    repoId = r!.id;
    // A generation job left `running` by a process that died mid-run.
    const [job] = await pg.handle.db
      .insert(t.jobs)
      .values({
        workspaceId,
        kind: GENERATE_JOB_KIND,
        payload: { repoId, workspaceId },
        status: 'running',
        startedAt: new Date(),
      })
      .returning({ id: t.jobs.id });
    orphanId = job!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('B8 / S-AC-28 + S-AC-29: boot reaps the orphaned running job as failed/interrupted, and a new generate request enqueues a NEW job id (S-AC-3 not deduped onto the orphan)', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        llm: { openai: new MockLLMProvider('openai', { structured: {} }) },
      },
    });

    const [reaped] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, orphanId));
    expect(reaped!.status).toBe('failed');
    expect(reaped!.error).toBe('interrupted');
    expect(reaped!.finishedAt).not.toBeNull();

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(202);
    const { jobId } = res.json();
    expect(jobId).toBeTruthy();
    expect(jobId).not.toBe(orphanId);

    await app.container.jobs.onIdle();
    await app.close();
  });
});
