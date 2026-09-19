import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Nothing to report.',
  score: 100,
  findings: [],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `skills-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 900,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A1 skills (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(structured: unknown) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured }) },
      },
    });
  }

  it('skill CRUD: create, get, list, delete', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'no-console-log', type: 'convention', body: '# No console.log\nFlag stray console.log calls.' },
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill.version).toBe(1);
    expect(skill.source).toBe('manual');
    expect(skill.enabled).toBe(true);

    const got = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(got.name).toBe('no-console-log');

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === skill.id)).toBe(true);

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);

    await app.close();
  });

  it('updating body bumps version; cosmetic edits do not', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'v-test', type: 'custom', body: 'v1 body' },
      })
    ).json();
    expect(skill.version).toBe(1);

    const renamed = (
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { description: 'new desc' } })
    ).json();
    expect(renamed.version).toBe(1);

    const rebodied = (
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'v2 body' } })
    ).json();
    expect(rebodied.version).toBe(2);

    await app.close();
  });

  it("run-executor resolves an agent's linked, enabled skills into the prompt; disabling one removes it", async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skilled Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review the diff.' },
      })
    ).json();

    const skillA = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'skill-a', type: 'rubric', body: 'RULE A: flag hardcoded secrets.' },
      })
    ).json();
    const skillB = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'skill-b', type: 'convention', body: 'RULE B: prefer async/await.' },
      })
    ).json();

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skillA.id, skillB.id] },
    });

    const run1 = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const trace1 = (
      await app.inject({ method: 'GET', url: `/runs/${run1.runs[0].run_id}/trace` })
    ).json();
    // Order preserved: skill-a's body appears before skill-b's.
    expect(trace1.prompt_assembly.skills).toContain('RULE A: flag hardcoded secrets.');
    expect(trace1.prompt_assembly.skills).toContain('RULE B: prefer async/await.');
    expect(trace1.prompt_assembly.skills.indexOf('RULE A')).toBeLessThan(
      trace1.prompt_assembly.skills.indexOf('RULE B'),
    );

    // Disable skill B — the next run's prompt drops it entirely.
    await app.inject({ method: 'PUT', url: `/skills/${skillB.id}`, payload: { enabled: false } });

    const run2 = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    const trace2 = (
      await app.inject({ method: 'GET', url: `/runs/${run2.runs[0].run_id}/trace` })
    ).json();
    expect(trace2.prompt_assembly.skills).toContain('RULE A: flag hardcoded secrets.');
    expect(trace2.prompt_assembly.skills).not.toContain('RULE B: prefer async/await.');

    await app.close();
  });

  it('import-url fetches the body server-side and stores it disabled', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('# Fetched skill\nBody from the URL.', { status: 200 }));

    const res = await app.inject({
      method: 'POST',
      url: '/skills/import-url',
      payload: { url: 'https://example.com/skills/fetched.md' },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill.name).toBe('Fetched skill');
    expect(skill.source).toBe('imported_url');
    expect(skill.enabled).toBe(false); // untrusted until a human vets it

    fetchSpy.mockRestore();
    await app.close();
  });

  it('import-url surfaces a clean error when the fetch fails', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));

    const res = await app.inject({
      method: 'POST',
      url: '/skills/import-url',
      payload: { url: 'https://example.com/missing.md' },
    });
    expect(res.statusCode).toBe(502);

    fetchSpy.mockRestore();
    await app.close();
  });

  it('community catalog: search then import stores it disabled', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const search = (await app.inject({ method: 'GET', url: '/skills/community?q=secret' })).json();
    expect(search.length).toBeGreaterThan(0);
    const target = search[0];

    const imported = (
      await app.inject({ method: 'POST', url: '/skills/import-community', payload: { name: target.name } })
    ).json();
    expect(imported.name).toBe(target.name);
    expect(imported.source).toBe('community');
    expect(imported.enabled).toBe(false);

    await app.close();
  });

  it('an agent with no linked skills has a null skills prompt block', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Unskilled Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json();
    const run = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const trace = (await app.inject({ method: 'GET', url: `/runs/${run.runs[0].run_id}/trace` })).json();
    expect(trace.prompt_assembly.skills).toBeNull();
    await app.close();
  });
});
