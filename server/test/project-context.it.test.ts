import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { ProjectContextRepository } from '../src/modules/project-context/repository.js';

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
