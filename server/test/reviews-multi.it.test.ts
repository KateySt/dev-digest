/* SPEC-10 T5 — multi-agent start, shared queue lifecycle, parallel executor,
   structured grounding in the trace (S-AC-1..9, 11, 12, 13..18, 40).
   Integration-only: the guarantees live in Postgres (atomic parent+children
   creation, in-flight checks) and in the process-wide queue. The LLM is a
   controllable fake so concurrency / ordering are observable. */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import * as t from '../src/db/schema.js';
import type { Review, RunTrace, StructuredRequest, StructuredResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (env: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** One finding that survives grounding (line 11) and one the gate drops (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

/** Which fake agent a review call belongs to: `MARK:<name>` is in its system prompt. */
const markOf = (req: StructuredRequest<unknown>) => /MARK:(\w+)/.exec(JSON.stringify(req.messages))?.[1] ?? '?';

/**
 * Controllable fake: review calls (schemaName 'Review') are counted, can be
 * held behind a gate, delayed, or made to fail per agent mark. Intent calls
 * pass straight through (and fail the schema -> best-effort "no intent").
 */
class ControlLLM extends MockLLMProvider {
  inFlight = 0;
  maxInFlight = 0;
  reviewCalls: string[] = [];
  gated = false;
  failMarks = new Set<string>();
  private waiters: Array<() => void> = [];
  constructor(structured: Review = REVIEW_FIXTURE) {
    super('openai', { structured });
  }
  hold() {
    this.gated = true;
  }
  /** Let exactly `n` held calls proceed. */
  releaseOne(n = 1) {
    for (let i = 0; i < n; i++) this.waiters.shift()?.();
  }
  releaseAll() {
    this.gated = false;
    while (this.waiters.length) this.waiters.shift()!();
  }
  get waiting() {
    return this.waiters.length;
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (req.schemaName !== 'Review') return super.completeStructured(req);
    const mark = markOf(req as StructuredRequest<unknown>);
    this.reviewCalls.push(mark);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.gated) await new Promise<void>((r) => this.waiters.push(r));
      else await new Promise((r) => setTimeout(r, 40));
      if (this.failMarks.has(mark)) throw new Error(`boom ${mark}`);
      return await super.completeStructured(req);
    } finally {
      this.inFlight--;
    }
  }
}

/** Counts how many times the shared diff is loaded. */
class CountingGit extends MockGitClient {
  diffCalls = 0;
  override async diff(...args: Parameters<MockGitClient['diff']>) {
    this.diffCalls++;
    return super.diff(...args);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(pred: () => Promise<boolean> | boolean, timeoutMs = 20_000) {
  const start = Date.now();
  while (!(await pred())) {
    if (Date.now() - start > timeoutMs) throw new Error('until: timed out');
    await sleep(15);
  }
}

const WAIT = { timeoutMs: 60_000 };
let prNumber = 2000;
let repoSeq = 0;

d('SPEC-10 multi-agent start + shared queue (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const agentIds: string[] = []; // A, B, C (enabled)
  let disabledAgentId: string;
  const closers: Array<() => Promise<unknown>> = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    await pg.handle.db.update(t.agents).set({ enabled: false });
    const app = await makeApp(new ControlLLM());
    for (const name of ['A', 'B', 'C', 'Off']) {
      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Multi ${name}`, provider: 'openai', model: 'gpt-4.1', system_prompt: `review MARK:${name}` },
      });
      if (name === 'Off') {
        disabledAgentId = res.json().id;
        await app.inject({ method: 'PUT', url: `/agents/${disabledAgentId}`, payload: { enabled: false } });
      } else agentIds.push(res.json().id);
    }
    await app.close();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    while (closers.length) await closers.pop()!();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(llm: MockLLMProvider, env: Record<string, string> = {}, git: MockGitClient = new MockGitClient({ diff: DIFF })) {
    return buildApp({
      config: config(env),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git, llm: { openai: llm } },
    });
  }
  /** Boot an app that is closed (and its LLM released) after the test. */
  async function boot(llm: ControlLLM, env: Record<string, string> = {}, git?: MockGitClient) {
    const app = await makeApp(llm, env, git);
    closers.push(async () => {
      llm.releaseAll();
      await app.close();
    });
    return app;
  }

  async function seedPr() {
    const db = pg.handle.db;
    const name = `multi-repo-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: prNumber++,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'body',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }

  type App = Awaited<ReturnType<typeof boot>>;
  const trigger = (app: App, prId: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: payload as object });
  const runsOf = (prId: string) => pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
  const multiRunsOf = (prId: string) =>
    pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, prId));
  const statusOf = async (runId: string) =>
    (await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId)))[0]!.status;

  // ---------------------------------------------------------------- start (S-AC-1..8)

  it('test_multi_run_creates_parent_and_children (S-AC-1)', async () => {
    const llm = new ControlLLM();
    const app = await boot(llm);
    const pr = await seedPr();
    const res = await trigger(app, pr.id, { agentIds: [agentIds[1], agentIds[0], agentIds[2]] });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.multi_agent_run_id).toEqual(expect.any(String));
    expect(body.runs.map((r: { agent_id: string }) => r.agent_id)).toEqual([agentIds[1], agentIds[0], agentIds[2]]);

    const parents = await multiRunsOf(pr.id);
    expect(parents).toHaveLength(1);
    expect(parents[0]!.id).toBe(body.multi_agent_run_id);
    const children = await runsOf(pr.id);
    expect(children).toHaveLength(3);
    expect(children.every((c) => c.multiAgentRunId === parents[0]!.id)).toBe(true);
    const order = new Map(children.map((c) => [c.agentId, c.multiAgentOrder]));
    expect([agentIds[1], agentIds[0], agentIds[2]].map((id) => order.get(id!))).toEqual([0, 1, 2]);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 3, ...WAIT });
  });

  it('test_agent_ids_dedupe (S-AC-2)', async () => {
    const app = await boot(new ControlLLM());
    const pr = await seedPr();
    const res = await trigger(app, pr.id, { agentIds: [agentIds[0], agentIds[1], agentIds[0], agentIds[1]] });
    expect(res.statusCode).toBe(200);
    expect(res.json().runs.map((r: { agent_id: string }) => r.agent_id)).toEqual([agentIds[0], agentIds[1]]);
    expect(await runsOf(pr.id)).toHaveLength(2);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2, ...WAIT });
  });

  it('test_agent_ids_invalid_400 (S-AC-3): empty, unknown, disabled -> 400, nothing created', async () => {
    const app = await boot(new ControlLLM());
    const pr = await seedPr();
    for (const agentIdsBody of [[], ['00000000-0000-4000-8000-000000000000'], [agentIds[0], disabledAgentId]]) {
      const res = await trigger(app, pr.id, { agentIds: agentIdsBody });
      expect(res.statusCode).toBe(400);
    }
    expect(await runsOf(pr.id)).toHaveLength(0);
    expect(await multiRunsOf(pr.id)).toHaveLength(0);
  });

  it('test_agent_ids_mixed_400 (S-AC-4)', async () => {
    const app = await boot(new ControlLLM());
    const pr = await seedPr();
    expect((await trigger(app, pr.id, { agentIds: [agentIds[0]], agentId: agentIds[1] })).statusCode).toBe(400);
    expect((await trigger(app, pr.id, { agentIds: [agentIds[0]], all: true })).statusCode).toBe(400);
    expect(await runsOf(pr.id)).toHaveLength(0);
    expect(await multiRunsOf(pr.id)).toHaveLength(0);
  });

  it('test_single_agent_multi_run (S-AC-5)', async () => {
    const app = await boot(new ControlLLM());
    const pr = await seedPr();
    const res = await trigger(app, pr.id, { agentIds: [agentIds[2]] });
    expect(res.statusCode).toBe(200);
    expect(res.json().multi_agent_run_id).toEqual(expect.any(String));
    expect(await multiRunsOf(pr.id)).toHaveLength(1);
    expect(await runsOf(pr.id)).toHaveLength(1);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1, ...WAIT });
  });

  it('test_legacy_body_unchanged (S-AC-6): agentId / all create no parent and no multi_agent_run_id', async () => {
    const app = await boot(new ControlLLM());
    const pr = await seedPr();
    const res = await trigger(app, pr.id, { agentId: agentIds[0] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('multi_agent_run_id');
    expect(Object.keys(res.json()).sort()).toEqual(['pr_id', 'reviews', 'runs']);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1, ...WAIT });
    const pr2 = await seedPr();
    const all = await trigger(app, pr2.id, { all: true });
    expect(all.json().runs).toHaveLength(agentIds.length);
    expect(await multiRunsOf(pr.id)).toHaveLength(0);
    expect(await multiRunsOf(pr2.id)).toHaveLength(0);
    expect((await runsOf(pr2.id)).every((r) => r.multiAgentRunId === null)).toBe(true);
    await waitForPrRuns(pg.handle.db, pr2.id, { expected: agentIds.length, ...WAIT });
  });

  it('test_multi_run_409_details (S-AC-7): queued or running blocks; details carry run ids + multi id', async () => {
    const llm = new ControlLLM();
    llm.hold();
    const app = await boot(llm, { REVIEW_CONCURRENCY: '1' }); // 1 running + 2 queued
    const pr = await seedPr();
    const first = await trigger(app, pr.id, { agentIds: agentIds });
    expect(first.statusCode).toBe(200);
    const second = await trigger(app, pr.id, { agentIds: [agentIds[0]] });
    expect(second.statusCode).toBe(409);
    const err = second.json().error;
    expect(err.code).toBe('review_in_progress');
    expect([...err.details.run_ids].sort()).toEqual(first.json().runs.map((r: { run_id: string }) => r.run_id).sort());
    expect(err.details.multi_agent_run_id).toBe(first.json().multi_agent_run_id);
    expect(await multiRunsOf(pr.id)).toHaveLength(1);
    expect(await runsOf(pr.id)).toHaveLength(3);

    // A merely-`queued` PR is also in flight for the bulk/single triggers.
    const single = await trigger(app, pr.id, { agentId: agentIds[0] });
    expect(single.statusCode).toBe(409);
    llm.releaseAll();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 3, ...WAIT });
  });

  it('test_multi_run_returns_immediately (S-AC-8)', async () => {
    const llm = new ControlLLM();
    llm.hold();
    const app = await boot(llm);
    const pr = await seedPr();
    const res = await trigger(app, pr.id, { agentIds });
    expect(res.statusCode).toBe(200); // every LLM call is still held
    await until(() => llm.waiting > 0);
    expect((await runsOf(pr.id)).every((r) => r.status === 'queued' || r.status === 'running')).toBe(true);
    llm.releaseAll();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 3, ...WAIT });
  });

  // ---------------------------------------------------------------- queue (S-AC-9, 11, 12, 13)

  it('test_concurrency_bound_across_triggers (S-AC-9): multi + single + all share one limit', async () => {
    const llm = new ControlLLM();
    const app = await boot(llm, { REVIEW_CONCURRENCY: '2' });
    const [p1, p2, p3] = [await seedPr(), await seedPr(), await seedPr()];
    await Promise.all([
      trigger(app, p1.id, { agentIds }),
      trigger(app, p2.id, { agentId: agentIds[0] }),
      trigger(app, p3.id, { all: true }),
    ]);
    for (const p of [p1, p2, p3]) await waitForPrRuns(pg.handle.db, p.id, WAIT);
    expect(llm.reviewCalls).toHaveLength(3 + 1 + agentIds.length);
    expect(llm.maxInFlight).toBe(2);
  });

  it('test_queued_fifo_and_position (S-AC-11, S-AC-12)', async () => {
    const llm = new ControlLLM();
    llm.hold();
    const app = await boot(llm, { REVIEW_CONCURRENCY: '1' });
    const pr = await seedPr();
    const res = await trigger(app, pr.id, { agentIds: [agentIds[0], agentIds[1], agentIds[2]] });
    const runIds: string[] = res.json().runs.map((r: { run_id: string }) => r.run_id);

    const active = async () =>
      (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs/active` })).json() as {
        run_id: string;
        status: string;
        queue_position: number | null;
      }[];
    await until(async () => (await active()).some((r) => r.status === 'running'));
    let rows = await active();
    const by = (id: string) => rows.find((r) => r.run_id === id)!;
    expect(by(runIds[0]!)).toMatchObject({ status: 'running', queue_position: null });
    expect(by(runIds[1]!)).toMatchObject({ status: 'queued', queue_position: 1 });
    expect(by(runIds[2]!)).toMatchObject({ status: 'queued', queue_position: 2 });

    // Free the slot: B (FIFO) starts next, C moves up to position 1.
    await until(() => llm.waiting === 1); // A's call is actually in flight
    llm.releaseOne();
    await until(async () => (await statusOf(runIds[1]!)) === 'running');
    rows = await active();
    expect(by(runIds[1]!)).toMatchObject({ status: 'running', queue_position: null });
    expect(by(runIds[2]!)).toMatchObject({ status: 'queued', queue_position: 1 });
    expect(await statusOf(runIds[0]!)).not.toBe('queued');
    llm.releaseAll();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 3, ...WAIT });
    expect(llm.reviewCalls).toEqual(['A', 'B', 'C']);
    const done = await runsOf(pr.id);
    expect(done.every((r) => r.startedAt && r.finishedAt)).toBe(true);
  });

  it('test_parallel_execution (S-AC-13): agents fitting free slots run concurrently', async () => {
    const llm = new ControlLLM();
    llm.hold();
    const app = await boot(llm, { REVIEW_CONCURRENCY: '3' });
    const pr = await seedPr();
    await trigger(app, pr.id, { agentIds });
    await until(() => llm.waiting === 3); // all three review calls in flight at once
    expect(llm.maxInFlight).toBe(3);
    llm.releaseAll();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 3, ...WAIT });
  });

  // ---------------------------------------------------------------- shared prep + isolation (S-AC-14..16)

  it('test_shared_prep_once (S-AC-14): diff loaded once for the whole multi-run, logged into every run', async () => {
    const llm = new ControlLLM();
    const git = new CountingGit({ diff: DIFF });
    const app = await boot(llm, { REVIEW_CONCURRENCY: '3' }, git);
    const pr = await seedPr();
    const res = await trigger(app, pr.id, { agentIds });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 3, ...WAIT });
    expect(git.diffCalls).toBe(1);
    for (const run of res.json().runs as { run_id: string }[]) {
      const trace = (await app.inject({ method: 'GET', url: `/runs/${run.run_id}/trace` })).json() as RunTrace;
      expect(trace.log.some((l) => l.msg.includes('Diff ready'))).toBe(true);
    }
  });

  it('test_failure_isolation (S-AC-15): one agent failing leaves the others complete', async () => {
    const llm = new ControlLLM();
    llm.failMarks.add('B');
    const app = await boot(llm, { REVIEW_CONCURRENCY: '3' });
    const pr = await seedPr();
    const res = await trigger(app, pr.id, { agentIds });
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 3, ...WAIT });
    const byAgent = new Map(runs.map((r) => [r.agentId, r]));
    expect(byAgent.get(agentIds[1]!)).toMatchObject({ status: 'failed' });
    expect(byAgent.get(agentIds[1]!)!.error).toContain('boom B');
    for (const id of [agentIds[0]!, agentIds[2]!]) {
      expect(byAgent.get(id)).toMatchObject({ status: 'done', findingsCount: 1, score: expect.any(Number) });
      const runId = byAgent.get(id)!.id;
      const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
      expect(trace.stats.findings).toBe(1);
    }
    expect(res.json().runs).toHaveLength(3);
  });

  it('test_prep_failure_fails_all (S-AC-16): every run of the group fails with one reason; other PRs unaffected', async () => {
    const llm = new ControlLLM();
    class FailingGit extends MockGitClient {
      override async diff(): Promise<never> {
        throw new Error('git exploded');
      }
    }
    const app = await boot(llm, { REVIEW_CONCURRENCY: '1' }, new FailingGit({ diff: DIFF }));
    const bad = await seedPr();
    const good = await seedPr();
    // Only the victim PR loses its stored patches too, so the pr_files fallback also fails.
    const original = ReviewRepository.prototype.getPrFiles;
    vi.spyOn(ReviewRepository.prototype, 'getPrFiles').mockImplementation(function (this: ReviewRepository, prId) {
      if (prId === bad.id) return Promise.reject(new Error('no patches'));
      return original.call(this, prId);
    });
    await trigger(app, bad.id, { agentIds });
    const runs = await waitForPrRuns(pg.handle.db, bad.id, { expected: 3, ...WAIT });
    expect(runs.every((r) => r.status === 'failed')).toBe(true);
    expect(new Set(runs.map((r) => r.error)).size).toBe(1);
    expect(runs[0]!.error).toContain('Failed to load PR diff');
    expect(llm.reviewCalls).toHaveLength(0); // queued siblings never started
    // a different PR still works end to end (git is down but pr_files fallback serves it)
    await trigger(app, good.id, { agentIds: [agentIds[0]] });
    const goodRuns = await waitForPrRuns(pg.handle.db, good.id, { expected: 1, ...WAIT });
    expect(goodRuns[0]!.status).toBe('done');
  });

  // ---------------------------------------------------------------- cancel + reaper (S-AC-17, 18)

  it('test_cancel_queued_no_llm (S-AC-17)', async () => {
    const llm = new ControlLLM();
    llm.hold();
    const app = await boot(llm, { REVIEW_CONCURRENCY: '1' });
    const pr = await seedPr();
    const res = await trigger(app, pr.id, { agentIds: [agentIds[0], agentIds[1]] });
    const [first, second] = (res.json().runs as { run_id: string }[]).map((r) => r.run_id);
    await until(() => llm.waiting === 1);
    expect(await statusOf(second!)).toBe('queued');

    const cancel = await app.inject({ method: 'POST', url: `/runs/${second}/cancel` });
    expect(cancel.statusCode).toBe(200);
    expect(await statusOf(second!)).toBe('cancelled'); // immediately

    llm.releaseAll();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2, ...WAIT });
    expect(llm.reviewCalls).toEqual(['A']); // the cancelled queued run never called the LLM
    expect(await statusOf(first!)).toBe('done');
    expect(await statusOf(second!)).toBe('cancelled');
  });

  it('a running cancel is not overwritten by the executor completing (done never replaces cancelled)', async () => {
    const llm = new ControlLLM();
    llm.hold();
    const app = await boot(llm);
    const pr = await seedPr();
    const res = await trigger(app, pr.id, { agentId: agentIds[0] });
    const runId = res.json().runs[0].run_id as string;
    await until(() => llm.waiting === 1);
    await app.inject({ method: 'POST', url: `/runs/${runId}/cancel` });
    llm.releaseAll();
    await sleep(500);
    expect(await statusOf(runId)).toBe('cancelled');
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json()).toHaveLength(0);
  });

  it('test_boot_reaper_queued (S-AC-18): queued and running rows from a dead process are failed with a restart reason', async () => {
    const pr = await seedPr();
    const [queued, running] = await pg.handle.db
      .insert(t.agentRuns)
      .values([
        { workspaceId, agentId: agentIds[0]!, prId: pr.id, status: 'queued', source: 'local' as const },
        { workspaceId, agentId: agentIds[1]!, prId: pr.id, status: 'running', source: 'local' as const },
      ])
      .returning();
    const app = await boot(new ControlLLM()); // buildApp awaits the boot reaper
    const rows = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.id, [queued!.id, running!.id]));
    for (const r of rows) {
      expect(r.status).toBe('failed');
      expect(r.error).toMatch(/restart/i);
      expect(r.finishedAt).not.toBeNull();
    }
    // ...and the PR is no longer blocked.
    const res = await trigger(app, pr.id, { agentId: agentIds[2] });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 3, ...WAIT });
  });

  // ---------------------------------------------------------------- trace (S-AC-40)

  it('test_trace_grounding_dropped (S-AC-40): kept/total/dropped[] with reasons + tokens and cost', async () => {
    const app = await boot(new ControlLLM());
    const pr = await seedPr();
    const res = await trigger(app, pr.id, { agentIds: [agentIds[0]] });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1, ...WAIT });
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    expect(trace.grounding).toMatchObject({ kept: 1, total: 2 });
    expect(trace.grounding!.dropped).toHaveLength(1);
    expect(trace.grounding!.dropped[0]).toMatchObject({
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      reason: expect.any(String),
    });
    expect(trace.grounding!.dropped[0]!.reason.length).toBeGreaterThan(0);
    expect(trace.stats).toMatchObject({ tokens_in: 100, tokens_out: 50, grounding: '1/2 passed' });
    expect(trace.config.model).toBe('gpt-4.1');
  });

  it('failure after the model responded keeps tokens/cost + grounding in the trace (S-AC-40)', async () => {
    const llm = new ControlLLM();
    const app = await boot(llm);
    const pr = await seedPr();
    vi.spyOn(ReviewRepository.prototype, 'insertReview').mockRejectedValue(new Error('db down'));
    const res = await trigger(app, pr.id, { agentIds: [agentIds[0]] });
    const runId = res.json().runs[0].run_id as string;
    const [run] = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1, ...WAIT });
    expect(run).toMatchObject({ status: 'failed', tokensIn: 100, tokensOut: 50 });
    expect(run!.costUsd).toBeGreaterThan(0);
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    expect(trace.stats).toMatchObject({ tokens_in: 100, tokens_out: 50 });
    expect(trace.grounding).toMatchObject({ kept: 1, total: 2 });
  });

  it('reads: active runs only lists in-flight rows', async () => {
    const app = await boot(new ControlLLM());
    const pr = await seedPr();
    await trigger(app, pr.id, { agentId: agentIds[0] });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1, ...WAIT });
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs/active` })).json()).toEqual([]);
    expect(
      (await pg.handle.db.select().from(t.agentRuns).where(and(eq(t.agentRuns.prId, pr.id)))).length,
    ).toBe(1);
  });
});
