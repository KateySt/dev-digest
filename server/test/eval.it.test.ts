import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { ne } from 'drizzle-orm';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** src/config.ts, hunk @@ -10,3 +10,4 @@ — new-side lines 10-12 are grounded
 *  (line 11 is the added `stripeKey` line); line 999 is NOT in the diff. */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** One grounded finding (line 11, matches the case's expected_output) + one
 *  that grounding will drop (line 999, not in the diff) — exercises both the
 *  recall/precision match AND the citation_accuracy derivation in one run. */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret.',
  score: 42,
  findings: [
    {
      id: 'f-grounded',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      confidence: 0.95,
    },
    {
      id: 'f-hallucinated',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
    },
  ],
};

/** Matching is file + line overlap only; severity/category are descriptive and ignored (S-29). */
const EXPECTED_OUTPUT = [{ severity: 'INFO', file: 'src/config.ts', start_line: 11, category: 'style' }];

d('eval (Testcontainers pg)', () => {
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
        git: new MockGitClient({ diff: '' }),
        llm: { openai: new MockLLMProvider('openai', { structured }) },
      },
    });
  }

  async function makeAgent(app: Awaited<ReturnType<typeof appWith>>, name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review the diff.' },
      })
    ).json();
  }

  it('eval case CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = await makeAgent(app, 'Eval CRUD Agent');

    const created = await app.inject({
      method: 'POST',
      url: '/eval-cases',
      payload: {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'stripe-key-leak',
        input_diff: DIFF,
        expected_output: EXPECTED_OUTPUT,
      },
    });
    expect(created.statusCode).toBe(201);
    const evalCase = created.json();

    const list = (
      await app.inject({ method: 'GET', url: `/eval-cases?owner_kind=agent&owner_id=${agent.id}` })
    ).json();
    expect(list).toHaveLength(1);
    expect(list[0].last_run).toBeNull(); // never run yet

    const updated = (
      await app.inject({ method: 'PUT', url: `/eval-cases/${evalCase.id}`, payload: { name: 'renamed' } })
    ).json();
    expect(updated.name).toBe('renamed');

    const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${evalCase.id}` });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${evalCase.id}` })).statusCode).toBe(404);

    await app.close();
  });

  it('POST /eval-cases/:id/run matches hand-computed recall/precision/citation_accuracy', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = await makeAgent(app, 'Eval Run Agent');
    const evalCase = (
      await app.inject({
        method: 'POST',
        url: '/eval-cases',
        payload: {
          owner_kind: 'agent',
          owner_id: agent.id,
          name: 'stripe-key-leak',
          input_diff: DIFF,
          expected_output: EXPECTED_OUTPUT,
        },
      })
    ).json();

    const res = await app.inject({ method: 'POST', url: `/eval-cases/${evalCase.id}/run` });
    expect(res.statusCode).toBe(200);
    const run = res.json();

    // The line-999 finding is dropped by grounding; the line-11 one survives
    // and matches expected_output exactly.
    expect(run.recall).toBe(1);
    expect(run.precision).toBe(1);
    // citation_accuracy = 1 kept / (1 kept + 1 dropped) = 0.5.
    expect(run.citation_accuracy).toBeCloseTo(0.5, 10);
    expect(run.pass).toBe(true);
    expect(run.actual_output).toHaveLength(1); // only the grounded finding

    // The case list now shows this as its last_run.
    const list = (
      await app.inject({ method: 'GET', url: `/eval-cases?owner_kind=agent&owner_id=${agent.id}` })
    ).json();
    expect(list[0].last_run.id).toBe(run.id);

    // eval-stats (S-45): the case shows its latest result from ANY run, but the
    // headline metrics only come from a completed SUITE run - a single-case run is not one.
    const stats = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-stats` })).json();
    expect(stats.cases_evaluated).toBe(1);
    expect(stats.case_results[0].id).toBe(run.id);
    expect(stats.latest_run).toBeNull();
    expect(stats.recall).toBeNull();
    expect(run.suite_run_id).toBeNull(); // S-26

    await app.close();
  });

  it('a must_find case with no expectations and a clean review passes, with null recall/precision (zero denominators, S-36)', async () => {
    const app = await appWith({ verdict: 'approve', summary: 'clean', score: 100, findings: [] });
    const agent = await makeAgent(app, 'Eval Clean Agent');
    const evalCase = (
      await app.inject({
        method: 'POST',
        url: '/eval-cases',
        payload: { owner_kind: 'agent', owner_id: agent.id, name: 'clean-case', input_diff: DIFF, expected_output: [] },
      })
    ).json();

    const run = (await app.inject({ method: 'POST', url: `/eval-cases/${evalCase.id}/run` })).json();
    expect(run.recall).toBeNull();
    expect(run.precision).toBeNull();
    expect(run.pass).toBe(true);

    await app.close();
  });

  it('a must_not_flag case passes when the review avoids the forbidden location and fails when it overlaps', async () => {
    const app = await appWith(REVIEW_FIXTURE); // grounded finding on line 11
    const agent = await makeAgent(app, 'Eval Forbidden Agent');
    const mk = (name: string, locations: unknown[]) =>
      app
        .inject({
          method: 'POST',
          url: '/eval-cases',
          payload: {
            owner_kind: 'agent',
            owner_id: agent.id,
            name,
            kind: 'must_not_flag',
            input_diff: DIFF,
            expected_output: locations,
          },
        })
        .then((r) => r.json());
    const elsewhere = await mk('forbid-elsewhere', [{ file: 'src/config.ts', start_line: 40, end_line: 45 }]);
    const overlapping = await mk('forbid-line-11', [{ file: 'src/config.ts', start_line: 10, end_line: 12 }]);

    const ok = (await app.inject({ method: 'POST', url: `/eval-cases/${elsewhere.id}/run` })).json();
    const bad = (await app.inject({ method: 'POST', url: `/eval-cases/${overlapping.id}/run` })).json();
    expect(ok.pass).toBe(true);
    expect(bad.pass).toBe(false);
    expect(bad.precision).toBe(0); // the single grounded finding is noise

    await app.close();
  });

  it('deleting an agent also deletes its agent-owned eval cases', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = await makeAgent(app, 'Eval Doomed Agent');
    const evalCase = (
      await app.inject({
        method: 'POST',
        url: '/eval-cases',
        payload: { owner_kind: 'agent', owner_id: agent.id, name: 'doomed', input_diff: DIFF, expected_output: [] },
      })
    ).json();

    expect((await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${evalCase.id}` })).statusCode).toBe(404);

    await app.close();
  });

  it('GET /eval-dashboard returns the cross-agent shape: per-agent rows (never-run agents included) and recent suite runs', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = await makeAgent(app, 'Eval Dashboard Agent');
    await app.inject({
      method: 'POST',
      url: '/eval-cases',
      payload: { owner_kind: 'agent', owner_id: agent.id, name: 'dashboard-case', input_diff: DIFF, expected_output: EXPECTED_OUTPUT },
    });

    const dashboard = (await app.inject({ method: 'GET', url: '/eval-dashboard' })).json();
    expect(Array.isArray(dashboard.recent_runs)).toBe(true);
    const row = dashboard.agents.find((a: { agent_id: string }) => a.agent_id === agent.id);
    expect(row).toMatchObject({ cases_total: 1, latest_run: null, running_run: null, history: [] });
    // The old workspace-batch fields are gone.
    expect(dashboard).not.toHaveProperty('cases_total');
    expect(dashboard).not.toHaveProperty('runs_total');

    await app.close();
  });

  it('the old synchronous workspace batch is replaced: POST /eval-dashboard/run-all answers 202 {started, skipped}', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = await makeAgent(app, 'Eval RunAll Agent');
    // Only this agent should be eligible, so the background batch stays small.
    await pg.handle.db.delete(t.evalCases).where(ne(t.evalCases.ownerId, agent.id));
    await app.inject({
      method: 'POST',
      url: '/eval-cases',
      payload: { owner_kind: 'agent', owner_id: agent.id, name: 'run-all-case', input_diff: DIFF, expected_output: EXPECTED_OUTPUT },
    });

    const res = await app.inject({ method: 'POST', url: '/eval-dashboard/run-all' });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.started).toContain(agent.id);
    expect(body).not.toHaveProperty('per_trace');

    // let the background suite finish before the DB goes away
    for (let i = 0; i < 200; i++) {
      const stats = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-stats` })).json();
      if (stats.latest_run) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await app.close();
  });
});
