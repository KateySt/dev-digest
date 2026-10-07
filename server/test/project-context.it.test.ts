import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { ProjectContextRepository } from '../src/modules/project-context/repository.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { RESYNC_JOB_KIND, INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Ten distinct candidate sets (different members AND different order) so an
 *  interleaved/duplicated result cannot accidentally equal one of them. */
const SETS: string[][] = Array.from({ length: 10 }, (_, i) => [
  `docs/set-${i}-a.md`,
  `docs/set-${i}-b.md`,
  ...(i % 2 === 0 ? [`docs/set-${i}-c.md`] : []),
]);

d('project-context attached sets (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        llm: { openai: new MockLLMProvider('openai', { structured: {} }) },
      },
    });
  }

  async function makeAgent(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review the diff.' },
      })
    ).json();
  }

  async function makeSkill(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    return (
      await app.inject({ method: 'POST', url: '/skills', payload: { name, type: 'convention', body: `body of ${name}` } })
    ).json();
  }

  const paths = (rows: { path: string }[]) => rows.map((r) => r.path);

  for (const kind of ['agents', 'skills'] as const) {
    const label = kind === 'agents' ? 'agent' : 'skill';
    const acReplace = kind === 'agents' ? 'S-AC-9' : 'S-AC-10';

    it(`B5 / ${acReplace}: POST /${kind}/:id/context replaces the whole ordered ${label} set (replace + order)`, async () => {
      const app = await makeApp();
      const owner = kind === 'agents' ? await makeAgent(app, 'Ctx Replace Agent') : await makeSkill(app, 'ctx-replace-skill');
      const post = (p: string[]) => app.inject({ method: 'POST', url: `/${kind}/${owner.id}/context`, payload: { paths: p } });

      const first = await post(['docs/a.md', 'docs/b.md', 'docs/c.md']);
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual([
        { path: 'docs/a.md', order: 0 },
        { path: 'docs/b.md', order: 1 },
        { path: 'docs/c.md', order: 2 },
      ]);

      // Replace with a reordered, smaller set: nothing from the old set survives.
      const second = await post(['docs/c.md', 'docs/a.md']);
      expect(second.json()).toEqual([
        { path: 'docs/c.md', order: 0 },
        { path: 'docs/a.md', order: 1 },
      ]);
      const read = (await app.inject({ method: 'GET', url: `/${kind}/${owner.id}/context` })).json();
      expect(paths(read)).toEqual(['docs/c.md', 'docs/a.md']);

      expect((await post([])).json()).toEqual([]);
      await app.close();
    });

    it(`B5 / S-AC-38: 10 concurrent POSTs to one ${label} all succeed and the final set equals exactly one submitted set`, async () => {
      const app = await makeApp();
      const owner = kind === 'agents' ? await makeAgent(app, 'Ctx Race Agent') : await makeSkill(app, 'ctx-race-skill');

      const results = await Promise.all(
        SETS.map((p) => app.inject({ method: 'POST', url: `/${kind}/${owner.id}/context`, payload: { paths: p } })),
      );
      expect(results.map((r) => r.statusCode)).toEqual(SETS.map(() => 200));

      const stored = (await app.inject({ method: 'GET', url: `/${kind}/${owner.id}/context` })).json();
      expect(stored.map((r: { order: number }) => r.order)).toEqual(stored.map((_: unknown, i: number) => i));
      expect(SETS).toContainEqual(paths(stored));
      await app.close();
    });
  }

  it('B5 / S-AC-39: a replace that fails partway leaves the previously stored set unchanged', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, 'Ctx Rollback Agent');
    const skill = await makeSkill(app, 'ctx-rollback-skill');
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/context`, payload: { paths: ['docs/keep.md'] } });
    await app.inject({ method: 'POST', url: `/skills/${skill.id}/context`, payload: { paths: ['docs/keep.md'] } });

    // Bypass the service's dedupe: a duplicate path violates the (owner, path) PK on insert,
    // AFTER the delete — the transaction must roll the delete back.
    const repo = new ProjectContextRepository(pg.handle.db);
    await expect(repo.setAgentDocuments(agent.id, ['docs/x.md', 'docs/x.md'])).rejects.toThrow();
    await expect(repo.setSkillDocuments(skill.id, ['docs/x.md', 'docs/x.md'])).rejects.toThrow();

    expect(paths(await repo.listAgentDocuments(agent.id))).toEqual(['docs/keep.md']);
    expect(paths(await repo.listSkillDocuments(skill.id))).toEqual(['docs/keep.md']);
    await app.close();
  });
});

d('project-context resync refusal (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  /** Mutable so a test can dirty the tree between the route pre-check and the job. */
  let modified: string[] = [];
  const git = new MockGitClient({ head: 'sha-1' });

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
        name: 'resync-target',
        fullName: 'acme/resync-target',
        clonePath: '/mock/clone',
      })
      .returning();
    repoId = r!.id;
    await pg.handle.db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: 'sha-1',
      indexerVersion: INDEXER_VERSION,
      status: 'full',
      filesIndexed: 3,
      filesSkipped: 0,
      stats: { durationMs: 5 },
    });
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git,
        gitStatus: { modifiedPaths: async () => modified },
        llm: { openai: new MockLLMProvider('openai', { structured: {} }) },
      },
    });
  }

  const resyncJobs = () =>
    pg.handle.db.select().from(t.jobs).where(eq(t.jobs.kind, RESYNC_JOB_KIND));

  it('B6 / S-AC-28 + S-AC-35: resync with modified project-context docs is a synchronous 409 listing every blocking path, enqueues nothing and does not sync', async () => {
    const app = await makeApp();
    modified = ['docs/guide.md', 'src/unrelated.ts', 'specs/a.md'];
    const before = (await resyncJobs()).length;

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/resync` });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('project_context_blocked');
    expect(res.json().error.details).toEqual({ paths: ['docs/guide.md', 'specs/a.md'] });
    expect((await resyncJobs()).length).toBe(before);
    expect(git.syncs).toHaveLength(0);
    await app.close();
  });

  it('B6: resync of an unknown repo id is 404, not an accepted job', async () => {
    const app = await makeApp();
    modified = [];
    const res = await app.inject({ method: 'POST', url: '/repos/00000000-0000-4000-8000-000000000000/resync' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('B6 / S-AC-36 + S-AC-37: an in-job race persists the reason without changing status; the next successful advance clears it', async () => {
    const app = await makeApp();
    // Accepted job whose tree became dirty after the route pre-check.
    modified = ['docs/late.md'];
    const job = await app.container.jobs.enqueue(workspaceId, RESYNC_JOB_KIND, { repoId });
    await job.done;

    let state = (await app.inject({ method: 'GET', url: `/repos/${repoId}/index-state` })).json();
    expect(state.status).toBe('full'); // status untouched (S-AC-36)
    expect(state.reason).toBe('project_context_blocked:docs/late.md');
    expect(git.syncs).toHaveLength(0);

    // Tree is clean again → a normal resync is accepted and succeeds.
    modified = [];
    const ok = await app.inject({ method: 'POST', url: `/repos/${repoId}/resync` });
    expect(ok.statusCode).toBe(202);
    await app.container.jobs.onIdle();

    expect(git.syncs).toHaveLength(1);
    state = (await app.inject({ method: 'GET', url: `/repos/${repoId}/index-state` })).json();
    expect(state.status).toBe('full');
    expect(state.reason).toBeUndefined(); // cleared (S-AC-37)
    await app.close();
  });
});
