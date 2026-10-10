import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockCatalogSource } from '../src/adapters/mocks.js';
import { eq } from 'drizzle-orm';
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

  function appWith(structured: unknown, catalogSource?: MockCatalogSource) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        // openrouter too: the skill_scan feature defaults to it, and an unmocked
        // provider would hit the network (or fail closed without a key in CI).
        llm: {
          openai: new MockLLMProvider('openai', { structured }),
          openrouter: new MockLLMProvider('openrouter', { structured }),
        },
        ...(catalogSource ? { catalogSource } : {}),
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

  it('SPEC-08 AC-35: deleting a skill also removes its eval cases, their results and its suite/draft runs (other skills untouched)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const mk = async (name: string) =>
      (await app.inject({ method: 'POST', url: '/skills', payload: { name, type: 'convention', body: `body of ${name}` } })).json();
    const doomed = await mk('doomed-skill');
    const keeper = await mk('keeper-skill');

    const seedEval = async (skillId: string) => {
      const [c] = await db
        .insert(t.evalCases)
        .values({ workspaceId: ws!.id, ownerKind: 'skill', ownerId: skillId, name: `case-${skillId}`, kind: 'must_find', source: 'manual' })
        .returning();
      const [suite] = await db
        .insert(t.evalSuiteRuns)
        .values({ workspaceId: ws!.id, ownerKind: 'skill', skillId, skillVersion: 1, status: 'completed', casesTotal: 1 })
        .returning();
      const [draft] = await db
        .insert(t.evalSuiteRuns)
        .values({ workspaceId: ws!.id, ownerKind: 'skill', skillId, skillVersion: null, isDraft: true, status: 'completed', casesTotal: 1 })
        .returning();
      await db.insert(t.evalRuns).values({ caseId: c!.id, suiteRunId: suite!.id, status: 'ok', pass: true });
      await db.insert(t.evalRuns).values({ caseId: c!.id, suiteRunId: null, status: 'ok', pass: true });
      return { caseId: c!.id, runIds: [suite!.id, draft!.id] };
    };
    const gone = await seedEval(doomed.id);
    const kept = await seedEval(keeper.id);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${doomed.id}` })).statusCode).toBe(200);

    expect(await db.select().from(t.evalCases).where(eq(t.evalCases.id, gone.caseId))).toHaveLength(0);
    expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, gone.caseId))).toHaveLength(0);
    expect(await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.skillId, doomed.id))).toHaveLength(0);

    expect(await db.select().from(t.evalCases).where(eq(t.evalCases.id, kept.caseId))).toHaveLength(1);
    expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, kept.caseId))).toHaveLength(2);
    expect(await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.skillId, keeper.id))).toHaveLength(2);
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
    const catalogSource = new MockCatalogSource({
      trees: {
        'owner/catalog-repo': [
          { path: 'python', type: 'tree' },
          { path: 'python/no-bare-except.md', type: 'blob' },
        ],
      },
      bodies: {
        'owner/catalog-repo#python/no-bare-except.md':
          '---\ndescription: Flags bare except clauses that swallow SECRET errors.\n---\n# No bare except',
      },
    });
    const app = await appWith(REVIEW_FIXTURE, catalogSource);
    await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { community_catalog_repo: 'owner/catalog-repo' },
    });
    const { repo } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const search = (await app.inject({ method: 'GET', url: '/skills/community?q=secret' })).json();
    expect(search.available).toBe(true);
    expect(search.entries.length).toBeGreaterThan(0);
    const target = search.entries[0];

    const imported = (
      await app.inject({
        method: 'POST',
        url: '/skills/import-community',
        payload: { path: target.path, repo_id: repo.id },
      })
    ).json();
    expect(imported.name).toBe(target.name);
    expect(imported.source).toBe('community');
    expect(imported.enabled).toBe(false);

    await app.close();
  });

  it('B7 / AC-50, AC-51: a non-uuid repo_id is 422 on create, update, import-community and list', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: { name: 'B7 target', type: 'convention', body: 'b' } })
    ).json();

    const create = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'B7 bad', type: 'convention', body: 'b', repo_id: 'not-a-uuid' },
    });
    const update = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { repo_id: 'not-a-uuid' } });
    const imp = await app.inject({
      method: 'POST',
      url: '/skills/import-community',
      payload: { path: 'x/y.md', repo_id: 'not-a-uuid' },
    });
    const list = await app.inject({ method: 'GET', url: '/skills?repo_id=not-a-uuid' });
    expect([create.statusCode, update.statusCode, imp.statusCode, list.statusCode]).toEqual([422, 422, 422, 422]);

    // null stays valid on update (clears to global); 'none' stays valid on list.
    expect((await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { repo_id: null } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/skills?repo_id=none' })).statusCode).toBe(200);

    const all = (await app.inject({ method: 'GET', url: '/skills' })).json() as { name: string }[];
    expect(all.some((s) => s.name === 'B7 bad')).toBe(false);
    await app.close();
  });

  it('B7 / AC-49: POST /skills with a foreign-workspace repo_id is rejected and persists nothing', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign-ws' }).returning();
    const [foreignRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: otherWs!.id, owner: 'evil', name: 'foreign', fullName: 'evil/foreign' })
      .returning();

    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'B7 foreign-scoped', type: 'convention', body: 'b', repo_id: foreignRepo!.id },
    });
    expect(res.statusCode).toBe(422);

    const rows = await pg.handle.db.select().from(t.skills).where(eq(t.skills.name, 'B7 foreign-scoped'));
    expect(rows).toHaveLength(0);

    // Own-workspace repo is still accepted.
    const { repo } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const ok = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'B7 own-scoped', type: 'convention', body: 'b', repo_id: repo.id },
    });
    expect(ok.statusCode).toBe(201);
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
