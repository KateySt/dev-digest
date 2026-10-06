import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  defaultWorkspaceId,
  insertSkill,
  insertSuiteRun,
  makeAgent,
  makeApp,
  makeCase,
  type App,
} from './helpers/eval-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

/**
 * SPEC-02 S-AC-38, 40, 41, 44, 45 — read side of suite runs: history + range,
 * cross-agent dashboard, compare (+ its 400/404s) and the Evals-tab stats.
 * Suite runs are inserted directly so dates/metrics are exact.
 */
d('eval history / dashboard / compare / stats (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ws: string;
  let app: App;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    ws = await defaultWorkspaceId(pg.handle.db);
    app = await makeApp(pg);
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const get = async (url: string) => app.inject({ method: 'GET', url });

  it('S-38: lists only runs started within 7d/30d/90d/all, newest first, with version, metrics, pass x/y, errored count, cost, status', async () => {
    const agent = await makeAgent(app);
    const mk = (days: number, over = {}) =>
      insertSuiteRun(pg.handle.db, ws, agent.id, { startedAt: daysAgo(days), finishedAt: daysAgo(days), ...over });
    const r3 = await mk(3, { agentVersion: 4, passedCount: 3, evaluatedCount: 4, erroredCount: 1, costUsd: 0.5 });
    const r20 = await mk(20);
    const r60 = await mk(60);
    const r200 = await mk(200);

    const ids = async (range: string) =>
      ((await get(`/agents/${agent.id}/eval-runs?range=${range}`)).json().runs as { id: string }[]).map((r) => r.id);

    expect(await ids('7d')).toEqual([r3.id]);
    expect(await ids('30d')).toEqual([r3.id, r20.id]);
    expect(await ids('90d')).toEqual([r3.id, r20.id, r60.id]);
    expect(await ids('all')).toEqual([r3.id, r20.id, r60.id, r200.id]);
  });

  it('S-38: row shape carries version, metrics, pass counts, errored count, cost and status', async () => {
    const agent = await makeAgent(app);
    await insertSuiteRun(pg.handle.db, ws, agent.id, {
      agentVersion: 4,
      recall: 0.75,
      precision: 0.5,
      citationAccuracy: 1,
      passedCount: 3,
      evaluatedCount: 4,
      erroredCount: 1,
      costUsd: 0.5,
    });
    const [run] = (await get(`/agents/${agent.id}/eval-runs?range=all`)).json().runs;
    expect(run).toMatchObject({
      agent_version: 4,
      recall: 0.75,
      precision: 0.5,
      citation_accuracy: 1,
      passed_count: 3,
      evaluated_count: 4,
      errored_count: 1,
      cost_usd: 0.5,
      status: 'completed',
    });
  });

  it('S-38: an invalid range is rejected at the edge (422)', async () => {
    const agent = await makeAgent(app);
    expect((await get(`/agents/${agent.id}/eval-runs?range=1y`)).statusCode).toBe(422);
  });

  it('S-39 end-to-end: regression alert uses the latest two COMPLETED runs; running/failed runs are ignored; history excludes them', async () => {
    const agent = await makeAgent(app);
    await insertSuiteRun(pg.handle.db, ws, agent.id, { agentVersion: 1, precision: 0.9, recall: 0.8, startedAt: daysAgo(5) });
    await insertSuiteRun(pg.handle.db, ws, agent.id, { agentVersion: 2, precision: 0.7, recall: 0.9, startedAt: daysAgo(4) });
    // Newer failed + running rows must not shift "latest completed".
    await insertSuiteRun(pg.handle.db, ws, agent.id, { agentVersion: 3, status: 'failed', precision: null, recall: null, startedAt: daysAgo(2) });
    await insertSuiteRun(pg.handle.db, ws, agent.id, { agentVersion: 3, status: 'running', finishedAt: null, startedAt: daysAgo(1) });

    const body = (await get(`/agents/${agent.id}/eval-runs?range=all`)).json();
    expect(body.runs).toHaveLength(4); // any status
    expect(body.history.map((r: { agent_version: number }) => r.agent_version)).toEqual([1, 2]); // completed, oldest first
    expect(body.alert).toMatchObject({
      version: 2,
      previous_version: 1,
      drops: [{ metric: 'precision', points: 20 }],
    });
    expect(body.alert.others).toContainEqual({ metric: 'recall', direction: 'up' });
    expect(body.alert.message).toContain('Precision dropped 20 points in v2 vs v1');
  });

  it('S-39: no alert when nothing dropped by a point', async () => {
    const agent = await makeAgent(app);
    await insertSuiteRun(pg.handle.db, ws, agent.id, { agentVersion: 1, precision: 0.8, startedAt: daysAgo(3) });
    await insertSuiteRun(pg.handle.db, ws, agent.id, { agentVersion: 2, precision: 0.9, startedAt: daysAgo(2) });
    expect((await get(`/agents/${agent.id}/eval-runs`)).json().alert).toBeNull();
  });

  it('S-40: cross-agent dashboard returns per-agent latest finished run, chronological sparkline history, running state and recent runs with agent names', async () => {
    const agent = await makeAgent(app);
    const never = await makeAgent(app);
    await makeCase(app, agent.id);
    await insertSuiteRun(pg.handle.db, ws, agent.id, { agentVersion: 1, recall: 0.5, startedAt: daysAgo(3) });
    const latest = await insertSuiteRun(pg.handle.db, ws, agent.id, { agentVersion: 2, recall: 0.9, startedAt: daysAgo(2) });
    await insertSuiteRun(pg.handle.db, ws, agent.id, {
      agentVersion: 2,
      status: 'running',
      finishedAt: null,
      casesTotal: 4,
      casesDone: 1,
      startedAt: daysAgo(1),
    });

    const dash = (await get('/eval-dashboard')).json();
    const row = dash.agents.find((a: { agent_id: string }) => a.agent_id === agent.id);
    expect(row).toMatchObject({ agent_name: agent.name, model: 'gpt-4.1', cases_total: 1 });
    expect(row.latest_run.id).toBe(latest.id); // newest FINISHED (completed) run, not the running one
    expect(row.history.map((h: { recall: number }) => h.recall)).toEqual([0.5, 0.9]); // oldest -> newest
    expect(row.running_run).toMatchObject({ cases_done: 1, cases_total: 4 });

    const idle = dash.agents.find((a: { agent_id: string }) => a.agent_id === never.id);
    expect(idle).toMatchObject({ latest_run: null, history: [], running_run: null, cases_total: 0 });

    const recent = dash.recent_runs.filter((r: { agent_id: string }) => r.agent_id === agent.id);
    expect(recent.length).toBeGreaterThanOrEqual(2);
    expect(recent[0].agent_name).toBe(agent.name);
  });

  describe('compare', () => {
    async function setup() {
      const agent = await makeAgent(app);
      const skill = await insertSkill(pg.handle.db, ws, 'Security rubric');
      await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill.id] } }); // v2
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'Be strict.', model: 'gpt-4o' } }); // v3
      const caseA = await makeCase(app, agent.id);
      const caseB = await makeCase(app, agent.id);
      const caseC = await makeCase(app, agent.id);
      const oldRun = await insertSuiteRun(pg.handle.db, ws, agent.id, {
        agentVersion: 1,
        recall: 0.6,
        precision: 0.9,
        citationAccuracy: 0.8,
        costUsd: 0.1,
        startedAt: daysAgo(4),
      });
      const newRun = await insertSuiteRun(pg.handle.db, ws, agent.id, {
        agentVersion: 3,
        recall: 0.8,
        precision: 0.7,
        citationAccuracy: 0.8,
        costUsd: 0.25,
        startedAt: daysAgo(2),
      });
      const result = (suiteRunId: string, caseId: string, fp: string) =>
        pg.handle.db.insert(t.evalRuns).values({ caseId, suiteRunId, status: 'ok', pass: true, inputFingerprint: fp });
      await result(oldRun.id, caseA.id, 'a1');
      await result(oldRun.id, caseB.id, 'b1');
      await result(newRun.id, caseA.id, 'a2'); // edited between runs
      await result(newRun.id, caseB.id, 'b1');
      await result(newRun.id, caseC.id, 'c1'); // new case -> sets differ
      return { agent, skill, oldRun, newRun };
    }

    it('S-41/S-42/S-43: returns both runs, deltas (new minus old), both snapshots (prompt, model, skills with versions), case-set and edited-case flags - ordered by version regardless of argument order', async () => {
      const { agent, skill, oldRun, newRun } = await setup();
      // base/head deliberately passed newest-first.
      const res = await get(`/agents/${agent.id}/eval-runs/compare?base=${newRun.id}&head=${oldRun.id}`);
      expect(res.statusCode).toBe(200);
      const c = res.json();

      expect(c.old.run.id).toBe(oldRun.id);
      expect(c.new.run.id).toBe(newRun.id);
      expect(c.deltas.recall).toBeCloseTo(0.2, 6);
      expect(c.deltas.precision).toBeCloseTo(-0.2, 6);
      expect(c.deltas.citation_accuracy).toBeCloseTo(0, 6);
      expect(c.deltas.cost_usd).toBeCloseTo(0.15, 6);

      expect(c.old.config).toMatchObject({ model: 'gpt-4.1', system_prompt: 'Review the diff.', skills: [] });
      expect(c.new.config).toMatchObject({ model: 'gpt-4o', system_prompt: 'Be strict.' });
      expect(c.new.config.skills).toEqual([{ id: skill.id, version: skill.version, name: 'Security rubric' }]);

      expect(c.case_sets_differ).toEqual({ old_count: 2, new_count: 3 });
      expect(c.edited_cases).toBe(1);
    });

    it('S-41: null deltas when a metric is null on either side; no flags when identical case sets', async () => {
      const agent = await makeAgent(app);
      const a = await insertSuiteRun(pg.handle.db, ws, agent.id, { agentVersion: 1, costUsd: null, recall: null });
      const b = await insertSuiteRun(pg.handle.db, ws, agent.id, { agentVersion: 1, startedAt: new Date(Date.now() + 1000) });
      const c = (await get(`/agents/${agent.id}/eval-runs/compare?base=${a.id}&head=${b.id}`)).json();
      expect(c.deltas.cost_usd).toBeNull();
      expect(c.deltas.recall).toBeNull();
      expect(c.case_sets_differ).toBeNull();
      expect(c.edited_cases).toBe(0);
    });

    it('S-44: runs from different agents are rejected with 400', async () => {
      const a1 = await makeAgent(app);
      const a2 = await makeAgent(app);
      const r1 = await insertSuiteRun(pg.handle.db, ws, a1.id);
      const r2 = await insertSuiteRun(pg.handle.db, ws, a2.id);
      const res = await get(`/agents/${a1.id}/eval-runs/compare?base=${r1.id}&head=${r2.id}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('agent_mismatch');
    });

    it('404 for an unknown run id; 422 for non-uuid ids', async () => {
      const a = await makeAgent(app);
      const r = await insertSuiteRun(pg.handle.db, ws, a.id);
      const ghost = '00000000-0000-0000-0000-000000000000';
      expect((await get(`/agents/${a.id}/eval-runs/compare?base=${r.id}&head=${ghost}`)).statusCode).toBe(404);
      expect((await get(`/agents/${a.id}/eval-runs/compare?base=x&head=y`)).statusCode).toBe(422);
    });
  });

  describe('S-45: GET /agents/:id/eval-stats', () => {
    it('latest completed run metrics + pass x/y with deltas vs previous completed run; per-case latest result from ANY run', async () => {
      const agent = await makeAgent(app);
      const c1 = await makeCase(app, agent.id);
      const c2 = await makeCase(app, agent.id);
      const prev = await insertSuiteRun(pg.handle.db, ws, agent.id, {
        recall: 0.5, precision: 0.5, citationAccuracy: 0.5, startedAt: daysAgo(5),
      });
      const latest = await insertSuiteRun(pg.handle.db, ws, agent.id, {
        agentVersion: 2, recall: 0.75, precision: 0.25, citationAccuracy: 0.5, passedCount: 3, evaluatedCount: 4, startedAt: daysAgo(3),
      });
      // A newer failed run must not count as "latest".
      await insertSuiteRun(pg.handle.db, ws, agent.id, { status: 'failed', recall: null, startedAt: daysAgo(1) });
      await pg.handle.db.insert(t.evalRuns).values([
        { caseId: c1.id, suiteRunId: prev.id, status: 'ok', pass: false, ranAt: daysAgo(5) },
        { caseId: c1.id, suiteRunId: latest.id, status: 'ok', pass: true, ranAt: daysAgo(3) },
        // c2 only has a more recent SINGLE-case run (no suite link) - it is still its latest result.
        { caseId: c2.id, suiteRunId: null, status: 'ok', pass: false, ranAt: daysAgo(0.5) },
      ]);

      const s = (await get(`/agents/${agent.id}/eval-stats`)).json();
      expect(s).toMatchObject({
        cases_total: 2,
        cases_evaluated: 2,
        recall: 0.75,
        precision: 0.25,
        citation_accuracy: 0.5,
        traces_passed: 3,
        traces_evaluated: 4,
      });
      expect(s.latest_run.id).toBe(latest.id);
      expect(s.delta.recall).toBeCloseTo(0.25, 6);
      expect(s.delta.precision).toBeCloseTo(-0.25, 6);
      expect(s.delta.citation_accuracy).toBeCloseTo(0, 6);
      const byCase = Object.fromEntries(s.case_results.map((r: { case_id: string; pass: boolean }) => [r.case_id, r.pass]));
      expect(byCase).toEqual({ [c1.id]: true, [c2.id]: false });
    });

    it('with no completed run: null metrics/deltas/pass counts, never-run cases excluded from case_results', async () => {
      const agent = await makeAgent(app);
      await makeCase(app, agent.id);
      const s = (await get(`/agents/${agent.id}/eval-stats`)).json();
      expect(s).toMatchObject({
        cases_total: 1,
        cases_evaluated: 0,
        recall: null,
        traces_passed: null,
        latest_run: null,
        delta: { recall: null, precision: null, citation_accuracy: null },
        case_results: [],
      });
    });
  });
});
