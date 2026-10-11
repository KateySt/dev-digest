/* SPEC-10 T7 — multi-agent read model, list, estimates and cancel-all
   (S-AC-12 results, S-AC-19..24, S-AC-34, S-AC-42, S-AC-45..47).
   Rows are seeded straight into Postgres: these endpoints are pure reads over
   persisted state plus the in-memory queue, so no LLM is involved. */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (env: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv);

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

interface SeedFinding {
  title: string;
  severity?: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  file?: string;
  line?: number;
  category?: string;
}
interface SeedChild {
  agentId: string | null;
  status: string;
  costUsd?: number | null;
  durationMs?: number | null;
  error?: string;
  findings?: SeedFinding[];
  traceAgent?: string;
  finishedAt?: Date | null;
}

let prNumber = 3000;
let repoSeq = 0;

d('SPEC-10 multi-agent results / list / estimates / cancel (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let otherWorkspaceId: string;
  const agentIds: Record<string, string> = {};
  const closers: Array<() => Promise<unknown>> = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    await pg.handle.db.update(t.agents).set({ enabled: false });
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws' } as never).returning();
    otherWorkspaceId = other!.id;
    const app = await boot();
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `MA ${name}`, provider: 'openai', model: 'gpt-4.1', system_prompt: `review ${name}` },
      });
      agentIds[name] = res.json().id;
    }
  });
  afterEach(async () => {
    while (closers.length) await closers.pop()!();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function boot(env: Record<string, string> = {}) {
    const app = await buildApp({
      config: config(env),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: '' }), llm: { openai: new MockLLMProvider('openai', {}) } },
    });
    closers.push(() => app.close());
    return app;
  }

  async function seedPr(ws = workspaceId) {
    const db = pg.handle.db;
    const name = `ma-repo-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: prNumber++,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        status: 'needs_review',
      })
      .returning();
    return pr!;
  }

  /** A multi-run with children in the given (selection) order. */
  async function seedMulti(prId: string, children: SeedChild[], opts: { ranAt?: Date; ws?: string } = {}) {
    const db = pg.handle.db;
    const ws = opts.ws ?? workspaceId;
    const [parent] = await db
      .insert(t.multiAgentRuns)
      .values({ workspaceId: ws, prId, ...(opts.ranAt ? { ranAt: opts.ranAt } : {}) })
      .returning();
    const runIds: string[] = [];
    for (const [i, c] of children.entries()) {
      const terminal = ['done', 'failed', 'cancelled'].includes(c.status);
      const [run] = await db
        .insert(t.agentRuns)
        .values({
          workspaceId: ws,
          agentId: c.agentId,
          prId,
          provider: 'openai',
          model: 'gpt-4.1',
          status: c.status,
          error: c.error ?? null,
          costUsd: c.costUsd ?? null,
          durationMs: c.durationMs ?? null,
          multiAgentRunId: parent!.id,
          multiAgentOrder: i,
          finishedAt: c.finishedAt !== undefined ? c.finishedAt : terminal ? new Date(parent!.ranAt.getTime() + 5000) : null,
        })
        .returning();
      runIds.push(run!.id);
      if (c.traceAgent) {
        await db.insert(t.runTraces).values({ runId: run!.id, trace: { config: { agent: c.traceAgent, model: 'gpt-4.1' } } });
      }
      if (c.status === 'done') {
        const [review] = await db
          .insert(t.reviews)
          .values({ workspaceId: ws, prId, agentId: c.agentId, runId: run!.id, kind: 'review', verdict: 'comment', summary: 'ok', score: 80, model: 'gpt-4.1' })
          .returning();
        for (const f of c.findings ?? []) {
          await db.insert(t.findings).values({
            reviewId: review!.id,
            file: f.file ?? 'src/a.ts',
            startLine: f.line ?? 10,
            endLine: f.line ?? 10,
            severity: f.severity ?? 'WARNING',
            category: f.category ?? 'bug',
            title: f.title,
            rationale: 'because',
            confidence: 0.9,
          });
        }
      }
    }
    return { multiId: parent!.id, runIds };
  }

  const get = (app: Awaited<ReturnType<typeof boot>>, id: string) =>
    app.inject({ method: 'GET', url: `/multi-agent-runs/${id}` });

  // ------------------------------------------------------------ results (S-AC-19, 20)

  it('test_results_shape_and_order: columns in selection order with identity + fields', async () => {
    const app = await boot();
    const pr = await seedPr();
    const { multiId, runIds } = await seedMulti(pr.id, [
      { agentId: agentIds.Gamma!, status: 'done', costUsd: 0.02, durationMs: 4000, findings: [{ title: 'Missing null check', line: 10 }] },
      { agentId: agentIds.Alpha!, status: 'failed', error: 'boom' },
      { agentId: agentIds.Beta!, status: 'done', costUsd: 0.03, durationMs: 6000, findings: [{ title: 'Missing null check', line: 11, severity: 'CRITICAL' }] },
    ]);
    const res = await get(app, multiId);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ id: multiId, pr_id: pr.id, pr_number: pr.number, pr_title: 'Add rate limiting', repo_id: pr.repoId, agent_count: 3 });
    expect(body.columns.map((c: { agent_id: string }) => c.agent_id)).toEqual([agentIds.Gamma, agentIds.Alpha, agentIds.Beta]);
    expect(body.columns.map((c: { run_id: string }) => c.run_id)).toEqual(runIds);
    const [g, a, b] = body.columns;
    expect(g).toMatchObject({ agent_name: 'MA Gamma', status: 'done', queue_position: null, error: null, provider: 'openai', model: 'gpt-4.1', duration_ms: 4000, cost_usd: 0.02, score: 80, verdict: 'comment', summary: 'ok' });
    expect(g.findings).toHaveLength(1);
    expect(g.findings[0]).toMatchObject({ title: 'Missing null check', accepted_at: null, dismissed_at: null });
    expect(a).toMatchObject({ status: 'failed', error: 'boom', findings: [] });
    expect(b.findings[0].severity).toBe('CRITICAL');
    // groups + conflicts are computed on read: Gamma and Beta flagged it, Alpha failed.
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].members).toHaveLength(2);
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0].takes.map((x: { agent_id: string }) => x.agent_id)).toEqual([agentIds.Gamma, agentIds.Alpha, agentIds.Beta]);
    expect(body.conflicts[0].is_conflict).toBe(true);
    expect(body.total_cost_usd).toBeCloseTo(0.05);
    expect(body.in_progress).toBe(false);
    expect(body.totals_partial).toBe(false);
    expect(body.total_duration_ms).toBe(5000);
  });

  it('test_results_null_not_zero (S-AC-20/21): unknown fields are null, cost is null with no recorded cost', async () => {
    const app = await boot();
    const pr = await seedPr();
    const { multiId } = await seedMulti(pr.id, [
      { agentId: agentIds.Alpha!, status: 'done' },
      { agentId: agentIds.Beta!, status: 'queued' },
    ]);
    const body = (await get(app, multiId)).json();
    expect(body.total_cost_usd).toBeNull();
    const [done, queued] = body.columns;
    expect(done.cost_usd).toBeNull();
    expect(done.duration_ms).toBeNull();
    expect(done.tokens_in).toBeNull();
    expect(done.tokens_out).toBeNull();
    expect(queued).toMatchObject({ score: null, verdict: null, summary: null, duration_ms: null, cost_usd: null, tokens_in: null, error: null });
  });

  it('test_in_progress_partial (S-AC-22) + queue positions (S-AC-12)', async () => {
    const app = await boot({ REVIEW_CONCURRENCY: '1' });
    const pr = await seedPr();
    const { multiId, runIds } = await seedMulti(pr.id, [
      { agentId: agentIds.Alpha!, status: 'running' },
      { agentId: agentIds.Beta!, status: 'queued' },
      { agentId: agentIds.Gamma!, status: 'queued' },
    ]);
    // Mirror the DB state in the real queue: 1 running slot, 2 waiting jobs.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const q = app.container.reviewQueue;
    closers.push(async () => release());
    for (const runId of runIds) void q.enqueue({ runId, groupKey: multiId, run: () => gate });
    await new Promise((r) => setTimeout(r, 20));

    const body = (await get(app, multiId)).json();
    expect(body.in_progress).toBe(true);
    expect(body.totals_partial).toBe(true);
    expect(body.columns.map((c: { queue_position: number | null }) => c.queue_position)).toEqual([null, 1, 2]);
    expect(body.columns.map((c: { status: string }) => c.status)).toEqual(['running', 'queued', 'queued']);
    release();
  });

  it('test_results_404 (S-AC-23): unknown id and other workspace', async () => {
    const app = await boot();
    expect((await get(app, UNKNOWN_ID)).statusCode).toBe(404);
    const otherPr = await seedPr(otherWorkspaceId);
    const { multiId } = await seedMulti(otherPr.id, [{ agentId: null, status: 'done' }], { ws: otherWorkspaceId });
    expect((await get(app, multiId)).statusCode).toBe(404);
    expect((await get(app, 'not-a-uuid')).statusCode).toBe(422);
  });

  it('agent deleted: name falls back to the trace config agent', async () => {
    const app = await boot();
    const pr = await seedPr();
    const { multiId } = await seedMulti(pr.id, [{ agentId: null, status: 'done', traceAgent: 'Retired Agent' }]);
    const body = (await get(app, multiId)).json();
    expect(body.columns[0].agent_name).toBe('Retired Agent');
  });

  // ------------------------------------------------------------ list (S-AC-24)

  it('test_list_newest_first: bare array, pr filter, default and explicit limit', async () => {
    const app = await boot();
    const pr = await seedPr();
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const { multiId } = await seedMulti(
        pr.id,
        [{ agentId: agentIds.Alpha!, status: 'done', costUsd: 0.01 }],
        { ranAt: new Date(Date.UTC(2026, 0, 1, 0, i)) },
      );
      ids.push(multiId);
    }
    const otherPr = await seedPr();
    await seedMulti(otherPr.id, [{ agentId: agentIds.Alpha!, status: 'running' }]);

    const res = await app.inject({ method: 'GET', url: `/multi-agent-runs?pr_id=${pr.id}` });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(10);
    expect(list.map((r: { id: string }) => r.id)).toEqual([...ids].reverse().slice(0, 10));
    expect(list[0]).toMatchObject({ pr_id: pr.id, pr_number: pr.number, pr_title: 'Add rate limiting', agent_count: 1, status: 'done', total_cost_usd: 0.01 });

    const two = (await app.inject({ method: 'GET', url: `/multi-agent-runs?pr_id=${pr.id}&limit=2` })).json();
    expect(two.map((r: { id: string }) => r.id)).toEqual([ids[11], ids[10]]);

    const unfiltered = (await app.inject({ method: 'GET', url: '/multi-agent-runs?limit=100' })).json();
    expect(unfiltered.some((r: { pr_id: string; status: string }) => r.pr_id === otherPr.id && r.status === 'running')).toBe(true);
  });

  // ------------------------------------------------------------ finding actions (S-AC-34)

  it('test_accept_dismiss_member_only: acting on one member leaves the other group member untouched', async () => {
    const app = await boot();
    const pr = await seedPr();
    const { multiId } = await seedMulti(pr.id, [
      { agentId: agentIds.Alpha!, status: 'done', findings: [{ title: 'Missing null check', line: 10 }] },
      { agentId: agentIds.Beta!, status: 'done', findings: [{ title: 'Missing null check', line: 10 }] },
    ]);
    const before = (await get(app, multiId)).json();
    expect(before.groups[0].members).toHaveLength(2);
    const [fa, fb] = before.columns.map((c: { findings: { id: string }[] }) => c.findings[0]!.id);

    expect((await app.inject({ method: 'POST', url: `/findings/${fa}/accept` })).statusCode).toBe(200);
    let after = (await get(app, multiId)).json();
    expect(after.columns[0].findings[0].accepted_at).toEqual(expect.any(String));
    expect(after.columns[1].findings[0]).toMatchObject({ accepted_at: null, dismissed_at: null });

    expect((await app.inject({ method: 'POST', url: `/findings/${fb}/dismiss` })).statusCode).toBe(200);
    after = (await get(app, multiId)).json();
    expect(after.columns[1].findings[0].dismissed_at).toEqual(expect.any(String));
    expect(after.columns[0].findings[0].dismissed_at).toBeNull();
  });

  // ------------------------------------------------------------ estimates (S-AC-42, 47)

  it('test_estimates: last 10 done runs per enabled agent; null (not 0) with no history', async () => {
    const app = await boot();
    const db = pg.handle.db;
    const pr = await seedPr();
    // Dedicated agents: other tests leave `done` runs on the shared ones.
    const mk = async (name: string) =>
      (await app.inject({ method: 'POST', url: '/agents', payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: name } })).json().id as string;
    const alphaId = await mk('Est Alpha');
    const betaId = await mk('Est Beta');
    const gammaId = await mk('Est Gamma');
    // Alpha: 12 done runs; the 2 oldest (durations 9000) must be excluded, newest 10 average 1000/0.10.
    for (let i = 0; i < 12; i++) {
      await db.insert(t.agentRuns).values({
        workspaceId,
        agentId: alphaId,
        prId: pr.id,
        status: 'done',
        durationMs: i < 2 ? 9000 : 1000,
        costUsd: i < 2 ? 9 : 0.1,
        ranAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      });
    }
    // A failed run must not count.
    await db.insert(t.agentRuns).values({ workspaceId, agentId: alphaId, prId: pr.id, status: 'failed', durationMs: 1, costUsd: 1 });
    // Beta: done but nothing recorded -> null means.
    await db.insert(t.agentRuns).values({ workspaceId, agentId: betaId, prId: pr.id, status: 'done' });
    // Gamma is disabled -> absent.
    await db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, gammaId));

    const res = await app.inject({ method: 'GET', url: '/multi-agent-runs/estimates' });
    expect(res.statusCode).toBe(200);
    const { agents } = res.json();
    const alpha = agents.find((a: { agent_id: string }) => a.agent_id === alphaId);
    expect(alpha).toMatchObject({ agent_name: 'Est Alpha', sample_size: 10 });
    expect(alpha.mean_duration_ms).toBeCloseTo(1000);
    expect(alpha.mean_cost_usd).toBeCloseTo(0.1);
    const beta = agents.find((a: { agent_id: string }) => a.agent_id === betaId);
    expect(beta).toMatchObject({ sample_size: 1, mean_duration_ms: null, mean_cost_usd: null });
    expect(agents.some((a: { agent_id: string }) => a.agent_id === gammaId)).toBe(false);
  });

  it('test_estimates_limit (S-AC-47): carries the effective REVIEW_CONCURRENCY', async () => {
    const def = await boot();
    expect((await def.inject({ method: 'GET', url: '/multi-agent-runs/estimates' })).json().review_concurrency).toBe(3);
    const two = await boot({ REVIEW_CONCURRENCY: '2' });
    expect((await two.inject({ method: 'GET', url: '/multi-agent-runs/estimates' })).json().review_concurrency).toBe(2);
  });

  // ------------------------------------------------------------ cancel (S-AC-45, 46)

  it('test_cancel_all: cancels queued+running children, keeps done/failed, lists ids', async () => {
    const app = await boot();
    const pr = await seedPr();
    const { multiId, runIds } = await seedMulti(pr.id, [
      { agentId: agentIds.Alpha!, status: 'done', findings: [{ title: 'kept finding' }] },
      { agentId: agentIds.Beta!, status: 'running' },
      { agentId: agentIds.Gamma!, status: 'queued' },
      { agentId: agentIds.Alpha!, status: 'failed', error: 'x' },
    ]);
    const res = await app.inject({ method: 'POST', url: `/multi-agent-runs/${multiId}/cancel` });
    expect(res.statusCode).toBe(200);
    expect([...res.json().cancelled_run_ids].sort()).toEqual([runIds[1]!, runIds[2]!].sort());
    const body = (await get(app, multiId)).json();
    expect(body.columns.map((c: { status: string }) => c.status)).toEqual(['done', 'cancelled', 'cancelled', 'failed']);
    expect(body.columns[0].findings).toHaveLength(1);
    expect(body.in_progress).toBe(false);
  });

  it('test_cancel_all_terminal_noop: all-terminal run -> 200, empty list, nothing changed', async () => {
    const app = await boot();
    const pr = await seedPr();
    const { multiId } = await seedMulti(pr.id, [
      { agentId: agentIds.Alpha!, status: 'done' },
      { agentId: agentIds.Beta!, status: 'failed', error: 'x' },
      { agentId: agentIds.Gamma!, status: 'cancelled' },
    ]);
    const res = await app.inject({ method: 'POST', url: `/multi-agent-runs/${multiId}/cancel` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ cancelled_run_ids: [] });
    const body = (await get(app, multiId)).json();
    expect(body.columns.map((c: { status: string }) => c.status)).toEqual(['done', 'failed', 'cancelled']);
  });

  it('test_cancel_all_404: unknown id and other workspace; other workspace children untouched', async () => {
    const app = await boot();
    expect((await app.inject({ method: 'POST', url: `/multi-agent-runs/${UNKNOWN_ID}/cancel` })).statusCode).toBe(404);
    const otherPr = await seedPr(otherWorkspaceId);
    const { multiId, runIds } = await seedMulti(otherPr.id, [{ agentId: null, status: 'queued' }], { ws: otherWorkspaceId });
    expect((await app.inject({ method: 'POST', url: `/multi-agent-runs/${multiId}/cancel` })).statusCode).toBe(404);
    const [row] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runIds[0]!));
    expect(row!.status).toBe('queued');
  });
});
