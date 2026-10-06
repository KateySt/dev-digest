import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  REVIEW_ONE_HIT_ONE_DROP,
  ScriptedLLM,
  countAgentRunsAndReviews,
  defaultWorkspaceId,
  deferred,
  eq,
  finding,
  getRun,
  insertSuiteRun,
  makeAgent,
  makeApp,
  makeCase,
  review,
  startRun,
  waitForProgress,
  waitForSuite,
  type ScriptedHandler,
} from './helpers/eval-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** Review whose only grounded finding is on line 12 -> does NOT overlap an expectation on line 11. */
const MISS_LINE_12 = review([finding({ id: 'miss', start_line: 12, end_line: 12 })]);

/**
 * SPEC-02 S-AC-17..28, 46 — versioned agent suite runs executed in the
 * background (202), scored with the pure scorer, with MockLLMProvider-style
 * scripted answers. Progress is observed by polling GET /eval-suite-runs/:id.
 */
d('agent eval suite runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ws: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    ws = await defaultWorkspaceId(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const hit: ScriptedHandler = () => ({ review: REVIEW_ONE_HIT_ONE_DROP });

  it('S-17/S-18/S-19/S-24: 202 immediately, sequential cases persisted as they finish, progress visible, pooled metrics stored', async () => {
    const gate = deferred();
    let second = '';
    const llm = new ScriptedLLM(async ({ caseName }) => {
      if (caseName === second) {
        await gate.promise; // hold case #2 in flight
        return { review: MISS_LINE_12 };
      }
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    });
    const app = await makeApp(pg, { llm });
    const agent = await makeAgent(app);
    const c1 = await makeCase(app, agent.id);
    const c2 = await makeCase(app, agent.id);
    second = c2.name;

    const res = await startRun(app, agent.id);
    expect(res.statusCode).toBe(202); // responds without waiting for the cases
    const started = res.json();
    expect(started).toMatchObject({ status: 'running', cases_total: 2 });

    // S-19: progress is completed / total while running.
    const mid = await waitForProgress(app, started.run_id, 1);
    expect(mid).toMatchObject({ status: 'running', cases_done: 1, cases_total: 2, agent_version: agent.version });
    // S-18: the finished case is already persisted and linked to the suite run.
    expect(mid.results).toHaveLength(1);
    expect(mid.results[0]).toMatchObject({ case_id: c1.id, suite_run_id: started.run_id, status: 'ok', pass: true });

    gate.resolve();
    const done = await waitForSuite(app, started.run_id);
    expect(done.status).toBe('completed');
    expect(done.results).toHaveLength(2);

    // Hand-computed pooled metrics:
    //   c1: expected 1, matched 1, grounded 1, noise 0, kept 1, dropped 1 (phantom line 999)
    //   c2: expected 1, matched 0, grounded 1, noise 1, kept 1, dropped 0
    expect(done.recall).toBeCloseTo(1 / 2, 10);
    expect(done.precision).toBeCloseTo((2 - 1) / 2, 10);
    expect(done.citation_accuracy).toBeCloseTo(2 / 3, 10);
    expect(done).toMatchObject({ passed_count: 1, evaluated_count: 2, errored_count: 0 });
    expect(done.cost_usd).toBeCloseTo(0.002, 10);
    expect(done.duration_ms).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it('S-17: a seeded agent without any agent_versions row gets a snapshot, and the run references its version', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const agent = await makeAgent(app);
    await makeCase(app, agent.id);
    await pg.handle.db.delete(t.agentVersions).where(eq(t.agentVersions.agentId, agent.id));

    const started = (await startRun(app, agent.id)).json();
    const run = await waitForSuite(app, started.run_id);
    expect(run.agent_version).toBe(agent.version);
    const snaps = await pg.handle.db.select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agent.id));
    expect(snaps.map((s) => s.version)).toEqual([agent.version]);
    await app.close();
  });

  it('S-20: a second start while running answers 409 and starts no new run', async () => {
    const gate = deferred();
    const llm = new ScriptedLLM(async () => {
      await gate.promise;
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    });
    const app = await makeApp(pg, { llm });
    const agent = await makeAgent(app);
    await makeCase(app, agent.id);

    const first = await startRun(app, agent.id);
    expect(first.statusCode).toBe(202);
    const second = await startRun(app, agent.id);
    expect(second.statusCode).toBe(409);

    const rows = await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, agent.id));
    expect(rows).toHaveLength(1);

    gate.resolve();
    await waitForSuite(app, first.json().run_id);
    // Lock released once the run finishes.
    const again = await startRun(app, agent.id);
    expect(again.statusCode).toBe(202);
    await waitForSuite(app, again.json().run_id);
    await app.close();
  });

  it('S-20: concurrent starts are race-proof - exactly one 202, the rest 409', async () => {
    const gate = deferred();
    const app = await makeApp(pg, {
      llm: new ScriptedLLM(async () => {
        await gate.promise;
        return { review: REVIEW_ONE_HIT_ONE_DROP };
      }),
    });
    const agent = await makeAgent(app);
    await makeCase(app, agent.id);

    const results = await Promise.all([1, 2, 3].map(() => startRun(app, agent.id)));
    expect(results.map((r) => r.statusCode).sort()).toEqual([202, 409, 409]);
    gate.resolve();
    await waitForSuite(app, results.find((r) => r.statusCode === 202)!.json().run_id);
    await app.close();
  });

  it('S-21: an agent with no cases answers 400 and creates no suite run', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const agent = await makeAgent(app);

    const res = await startRun(app, agent.id);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('no_cases');
    const rows = await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, agent.id));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('S-22/S-23: a throwing case is recorded errored with its message, excluded from metrics, and the run continues and completes', async () => {
    let boom = '';
    const llm = new ScriptedLLM(({ caseName }) => {
      if (caseName === boom) throw new Error('model exploded');
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    });
    const app = await makeApp(pg, { llm });
    const agent = await makeAgent(app);
    await makeCase(app, agent.id);
    const bad = await makeCase(app, agent.id);
    await makeCase(app, agent.id);
    boom = bad.name;

    const done = await waitForSuite(app, (await startRun(app, agent.id)).json().run_id);
    expect(done.status).toBe('completed');
    expect(done).toMatchObject({ cases_done: 3, passed_count: 2, evaluated_count: 2, errored_count: 1 });
    const errored = done.results.find((r) => r.case_name === bad.name)!;
    expect(errored).toMatchObject({ status: 'errored', pass: null });
    expect(errored.error).toContain('model exploded');
    // Metrics pool only the 2 healthy cases (each: recall 1, precision 1, citation 1/2).
    expect(done.recall).toBe(1);
    expect(done.precision).toBe(1);
    expect(done.citation_accuracy).toBeCloseTo(0.5, 10);
    await app.close();
  });

  it('S-23: when every case errors the run is failed with null metrics and null cost', async () => {
    const llm = new ScriptedLLM(() => {
      throw new Error('provider down');
    });
    const app = await makeApp(pg, { llm });
    const agent = await makeAgent(app);
    await makeCase(app, agent.id);
    await makeCase(app, agent.id);

    const done = await waitForSuite(app, (await startRun(app, agent.id)).json().run_id);
    expect(done.status).toBe('failed');
    expect(done).toMatchObject({
      evaluated_count: 0,
      errored_count: 2,
      passed_count: 0,
      recall: null,
      precision: null,
      citation_accuracy: null,
      cost_usd: null,
    });
    expect(done.results.every((r) => r.status === 'errored')).toBe(true);
    await app.close();
  });

  it('S-24: cost is null when any finished case has unknown cost, otherwise the sum', async () => {
    let unknownFor = '';
    const llm = new ScriptedLLM(({ caseName }) => ({
      review: REVIEW_ONE_HIT_ONE_DROP,
      costUsd: caseName === unknownFor ? null : 0.01,
    }));
    const app = await makeApp(pg, { llm });
    const agent = await makeAgent(app);
    await makeCase(app, agent.id);
    const noCost = await makeCase(app, agent.id);

    const known = await waitForSuite(app, (await startRun(app, agent.id)).json().run_id);
    expect(known.cost_usd).toBeCloseTo(0.02, 10);

    unknownFor = noCost.name;
    const unknown = await waitForSuite(app, (await startRun(app, agent.id)).json().run_id);
    expect(unknown.status).toBe('completed');
    expect(unknown.cost_usd).toBeNull();
    await app.close();
  });

  it('S-24: must_find passes only if all expectations match; must_not_flag with empty list ("assert empty") fails on any finding', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const agent = await makeAgent(app);
    await makeCase(app, agent.id); // must_find line 11 -> hit
    const forbidAll = await makeCase(app, agent.id, { kind: 'must_not_flag', expected_output: [] });

    const done = await waitForSuite(app, (await startRun(app, agent.id)).json().run_id);
    expect(done.results.find((r) => r.case_id === forbidAll.id)!.pass).toBe(false);
    expect(done).toMatchObject({ passed_count: 1, evaluated_count: 2 });
    // precision pools grounded findings of both cases: 2 grounded, 1 noise.
    expect(done.precision).toBeCloseTo(0.5, 10);
    await app.close();
  });

  it('S-26: running ONE case persists a result with no suite link and does not appear in suite history', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const agent = await makeAgent(app);
    const c = await makeCase(app, agent.id);

    const res = await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ suite_run_id: null, status: 'ok', pass: true });

    const history = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
    expect(history.runs).toHaveLength(0);
    const list = (await app.inject({ method: 'GET', url: `/eval-cases?owner_kind=agent&owner_id=${agent.id}` })).json();
    expect(list[0].last_run.id).toBe(res.json().id);
    await app.close();
  });

  it('S-46: suite runs and single-case runs create no agent_runs or reviews rows', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const agent = await makeAgent(app);
    const c = await makeCase(app, agent.id);
    const before = await countAgentRunsAndReviews(pg.handle.db);

    await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` });
    await waitForSuite(app, (await startRun(app, agent.id)).json().run_id);

    expect(await countAgentRunsAndReviews(pg.handle.db)).toEqual(before);
    await app.close();
  });

  it('S-28: booting the app marks every still-running suite run failed ("interrupted") and releases the lock', async () => {
    const app0 = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const agent = await makeAgent(app0);
    await makeCase(app0, agent.id);
    const orphan = await insertSuiteRun(pg.handle.db, ws, agent.id, {
      status: 'running',
      finishedAt: null,
      agentVersion: agent.version,
      casesTotal: 1,
      casesDone: 0,
    });
    // While it "runs", the lock holds.
    expect((await startRun(app0, agent.id)).statusCode).toBe(409);
    await app0.close();

    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) }); // buildApp awaits the reaper
    const reaped = await getRun(app, orphan.id);
    expect(reaped.status).toBe('failed');
    expect(reaped.failure_reason).toBe('interrupted');

    const retry = await startRun(app, agent.id);
    expect(retry.statusCode).toBe(202);
    await waitForSuite(app, retry.json().run_id);
    await app.close();
  });

  it('S-27: run-all starts every enabled agent with cases, skips ones already running, ignores agents without cases / disabled', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    // Isolate from the seeded demo agents: only agents created here have cases.
    await pg.handle.db.delete(t.evalCases);

    const a1 = await makeAgent(app);
    const a2 = await makeAgent(app);
    const busy = await makeAgent(app);
    const empty = await makeAgent(app);
    const disabled = await makeAgent(app);
    for (const a of [a1, a2, busy, disabled]) await makeCase(app, a.id);
    await app.inject({ method: 'PUT', url: `/agents/${disabled.id}`, payload: { enabled: false } });
    const running = await insertSuiteRun(pg.handle.db, ws, busy.id, {
      status: 'running',
      finishedAt: null,
      casesTotal: 1,
      casesDone: 0,
    });

    const res = await app.inject({ method: 'POST', url: '/eval-dashboard/run-all' });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect([...body.started].sort()).toEqual([a1.id, a2.id].sort());
    expect(body.skipped).toEqual([busy.id]);
    expect([...body.started, ...body.skipped]).not.toContain(empty.id);
    expect([...body.started, ...body.skipped]).not.toContain(disabled.id);

    // Both started agents show `running` immediately (rows are inserted up front) and then complete.
    const rows = await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, a2.id));
    expect(rows).toHaveLength(1);
    for (const a of [a1, a2]) {
      const [row] = await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, a.id));
      const done = await waitForSuite(app, row!.id);
      expect(done.status).toBe('completed');
    }
    // The pre-existing running run was left untouched.
    expect((await getRun(app, running.id)).status).toBe('running');
    await pg.handle.db.update(t.evalSuiteRuns).set({ status: 'failed' }).where(eq(t.evalSuiteRuns.id, running.id));
    await app.close();
  });
});
