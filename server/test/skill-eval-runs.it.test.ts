import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SKILL_EVAL_SYSTEM_PROMPT } from '../src/modules/eval/constants.js';
import {
  REVIEW_ONE_HIT_ONE_DROP,
  ScriptedLLM,
  defaultWorkspaceId,
  deferred,
  eq,
  finding,
  getRun,
  inArray,
  insertSkill,
  insertSkillSuiteRun,
  makeAgent,
  makeApp,
  makeCase,
  review,
  saveSkillVersion,
  startSkillRun,
  waitForProgress,
  waitForSuite,
  type App,
  type ScriptedHandler,
  type SuiteRunBody,
} from './helpers/eval-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** Grounded finding on line 12 -> does NOT overlap the expectation on line 11 (case fails). */
const MISS_LINE_12 = review([finding({ id: 'miss', start_line: 12, end_line: 12 })]);

const DEFAULT_MODEL = { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' };

type SkillRunBody = SuiteRunBody & {
  owner_kind: 'skill';
  skill_id: string;
  skill_version: number | null;
  is_draft: boolean;
  provider: string | null;
  model: string | null;
};

const skillRun = async (app: App, id: string) => (await getRun(app, id)) as unknown as SkillRunBody;
const waitSkill = async (app: App, id: string) => (await waitForSuite(app, id)) as unknown as SkillRunBody;

async function until(cond: () => boolean | Promise<boolean>, timeoutMs = 10_000) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > timeoutMs) throw new Error('until(): condition not met in time');
    await new Promise((r) => setTimeout(r, 20));
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * SPEC-08 SK-AC-1..37 - skill eval suite/draft runs, history, compare, dashboard,
 * delete cascade. Ring 2: real Postgres (partial unique indexes, FK cascade) +
 * scripted LLM + the real service. AC-38 (degrade-and-rerun experiment) is manual.
 */
d('skill eval runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ws: string;
  let db: PgFixture['handle']['db'];

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    await seed(db);
    ws = await defaultWorkspaceId(db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const hit: ScriptedHandler = () => ({ review: REVIEW_ONE_HIT_ONE_DROP });

  async function skillWithCases(app: App, n: number, body?: string, over?: Parameters<typeof insertSkill>[4]) {
    const skill = await insertSkill(db, ws, undefined, body, over);
    const cases = [];
    for (let i = 0; i < n; i++) cases.push(await makeCase(app, skill.id, { owner_kind: 'skill' }));
    return { skill, cases };
  }

  it('SK-1 / AC-1: start answers 202 immediately with a running run tied to the skill version and the resolved skill_eval model', async () => {
    const gate = deferred();
    const llm = new ScriptedLLM(async () => {
      await gate.promise;
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    });
    const app = await makeApp(pg, { llm });
    const { skill } = await skillWithCases(app, 2);

    const res = await startSkillRun(app, skill.id);
    expect(res.statusCode).toBe(202); // does not wait for the model
    const started = res.json();
    expect(started).toMatchObject({ status: 'running', cases_total: 2, is_draft: false });

    const run = await skillRun(app, started.run_id);
    expect(run).toMatchObject({
      owner_kind: 'skill',
      skill_id: skill.id,
      skill_version: skill.version,
      is_draft: false,
      status: 'running',
      ...DEFAULT_MODEL,
    });

    gate.resolve();
    expect((await waitSkill(app, started.run_id)).status).toBe('completed');
    await app.close();
  });

  it('SK-1: a missing skill answers 404', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const res = await startSkillRun(app, '00000000-0000-4000-8000-000000000000');
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('SK-2 / AC-2: cases run sequentially with the baseline prompt, ONLY this skill and the resolved model; each result is persisted linked to the run', async () => {
    const gate = deferred();
    let second = '';
    const llm = new ScriptedLLM(async ({ caseName }) => {
      if (caseName === second) await gate.promise;
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    });
    const app = await makeApp(pg, { llm });
    const other = await insertSkill(db, ws, undefined, 'OTHER-SKILL-TEXT-MUST-NOT-LEAK');
    const { skill, cases } = await skillWithCases(app, 3, 'THIS-SKILL-TEXT');
    second = cases[1]!.name;

    const started = (await startSkillRun(app, skill.id)).json();
    // Case 1 is persisted and linked; case 2 is held in flight.
    const mid = await waitForProgress(app, started.run_id, 1);
    expect(mid.results).toHaveLength(1);
    expect(mid.results[0]).toMatchObject({ case_id: cases[0]!.id, suite_run_id: started.run_id, status: 'ok' });
    await until(() => llm.callCount >= 2);
    await sleep(150);
    expect(llm.callCount).toBe(2); // sequential: case 3 has not started

    gate.resolve();
    const done = await waitSkill(app, started.run_id);
    expect(done.results.map((r) => r.case_id)).toEqual(cases.map((c) => c.id));

    expect(llm.requests).toHaveLength(3);
    for (const req of llm.requests) {
      const text = JSON.stringify(req.messages);
      expect(text).toContain(SKILL_EVAL_SYSTEM_PROMPT);
      expect(text).toContain('THIS-SKILL-TEXT');
      expect(text).not.toContain(other.body);
      expect(req.model).toBe(DEFAULT_MODEL.model);
    }
    await app.close();
  });

  it('SK-3 / AC-3: saving a new version mid-run does not change the text or version the run uses', async () => {
    const gate = deferred();
    const llm = new ScriptedLLM(async ({ call }) => {
      if (call === 1) await gate.promise;
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    });
    const app = await makeApp(pg, { llm });
    const { skill } = await skillWithCases(app, 2, 'OLD-TEXT');

    const started = (await startSkillRun(app, skill.id)).json();
    await until(() => llm.callCount >= 1);
    const v2 = await saveSkillVersion(db, skill.id, 'NEW-TEXT');
    expect(v2).toBe(skill.version + 1);
    gate.resolve();

    const done = await waitSkill(app, started.run_id);
    expect(done.skill_version).toBe(skill.version);
    expect(llm.requests).toHaveLength(2);
    for (const req of llm.requests) {
      const text = JSON.stringify(req.messages);
      expect(text).toContain('OLD-TEXT');
      expect(text).not.toContain('NEW-TEXT');
    }
    await app.close();
  });

  it('SK-4 / AC-4: the read endpoint reports completed and total case counts while running', async () => {
    const gate = deferred();
    let second = '';
    const llm = new ScriptedLLM(async ({ caseName }) => {
      if (caseName === second) await gate.promise;
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    });
    const app = await makeApp(pg, { llm });
    const { skill, cases } = await skillWithCases(app, 2);
    second = cases[1]!.name;

    const started = (await startSkillRun(app, skill.id)).json();
    const mid = await waitForProgress(app, started.run_id, 1);
    expect(mid).toMatchObject({ status: 'running', cases_done: 1, cases_total: 2 });
    gate.resolve();
    await waitSkill(app, started.run_id);
    await app.close();
  });

  it('SK-5 / AC-5: a second start answers 409 while a suite or draft run is running, in both directions, and starts no run', async () => {
    const gate = deferred();
    const llm = new ScriptedLLM(async () => {
      await gate.promise;
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    });
    const app = await makeApp(pg, { llm });
    const { skill } = await skillWithCases(app, 1, 'saved body');
    const rowsFor = () => db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.skillId, skill.id));

    const suite = await startSkillRun(app, skill.id);
    expect(suite.statusCode).toBe(202);
    expect((await startSkillRun(app, skill.id, 'a draft')).statusCode).toBe(409); // suite -> draft
    expect((await startSkillRun(app, skill.id)).statusCode).toBe(409); // suite -> suite
    expect(await rowsFor()).toHaveLength(1);
    gate.resolve();
    await waitSkill(app, suite.json().run_id);

    // Reverse direction: a running draft blocks a suite run.
    const gate2 = deferred();
    llm.handler = async () => {
      await gate2.promise;
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    };
    const draft = await startSkillRun(app, skill.id, 'a draft');
    expect(draft.statusCode).toBe(202);
    expect((await startSkillRun(app, skill.id)).statusCode).toBe(409); // draft -> suite
    expect((await startSkillRun(app, skill.id, 'another draft')).statusCode).toBe(409); // draft -> draft
    expect(await rowsFor()).toHaveLength(2);
    gate2.resolve();
    await waitSkill(app, draft.json().run_id);
    await app.close();
  });

  it('SK-6 / AC-6: a skill with no cases answers 400 and creates no run', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const skill = await insertSkill(db, ws);
    const res = await startSkillRun(app, skill.id);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('no_cases');
    expect(await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.skillId, skill.id))).toHaveLength(0);
    await app.close();
  });

  const BLOCKING_FINDING = [
    { severity: 'high', category: 'exfiltration', excerpt: 'x', location: 'l', explanation: 'e' },
  ];
  it.each([
    ['pending', { scanStatus: 'pending' as const }],
    ['error', { scanStatus: 'error' as const }],
    ['flagged', { scanStatus: 'flagged' as const, scanFindings: BLOCKING_FINDING }],
  ])('SK-7 / AC-7: scan status %s answers 422 naming the scan state, creates no run and sends no text to a model', async (status, over) => {
    const llm = new ScriptedLLM(hit);
    const app = await makeApp(pg, { llm });
    const { skill, cases } = await skillWithCases(app, 1, 'SECRET-SKILL-TEXT', over);

    for (const res of [
      await startSkillRun(app, skill.id),
      await startSkillRun(app, skill.id, 'a draft body'),
      await app.inject({ method: 'POST', url: `/eval-cases/${cases[0]!.id}/run` }), // single-case run follows AC-7 too
    ]) {
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('skill_scan_not_passed');
      expect(res.json().error.details).toEqual({ scan_status: status });
    }
    expect(llm.callCount).toBe(0);
    expect(await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.skillId, skill.id))).toHaveLength(0);
    await app.close();
  });

  it('SK-8 / AC-8: a disabled skill with a passed scan can be run (flagged with only medium findings passes too)', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const { skill } = await skillWithCases(app, 1, undefined, { enabled: false });
    const res = await startSkillRun(app, skill.id);
    expect(res.statusCode).toBe(202);
    expect((await waitSkill(app, res.json().run_id)).status).toBe('completed');

    const { skill: medium } = await skillWithCases(app, 1, undefined, {
      scanStatus: 'flagged',
      scanFindings: [{ ...BLOCKING_FINDING[0], severity: 'medium' }],
    });
    expect((await startSkillRun(app, medium.id)).statusCode).toBe(202);
    await app.close();
  });

  it('SK-9 / AC-9: a throwing case is recorded errored with its message, excluded from metrics and pass count, and the run continues', async () => {
    let boom = '';
    const llm = new ScriptedLLM(({ caseName }) => {
      if (caseName === boom) throw new Error('model exploded');
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    });
    const app = await makeApp(pg, { llm });
    const { skill, cases } = await skillWithCases(app, 3);
    boom = cases[1]!.name;

    const done = await waitSkill(app, (await startSkillRun(app, skill.id)).json().run_id);
    expect(done).toMatchObject({ status: 'completed', cases_done: 3, passed_count: 2, evaluated_count: 2, errored_count: 1 });
    const errored = done.results.find((r) => r.case_id === cases[1]!.id)!;
    expect(errored).toMatchObject({ status: 'errored', pass: null });
    expect(errored.error).toContain('model exploded');
    expect(done.recall).toBe(1);
    expect(done.precision).toBe(1);
    await app.close();
  });

  it('SK-10 / AC-10: completed when at least one case finished, failed (null metrics and cost) when every case errored', async () => {
    const app = await makeApp(pg, {
      llm: new ScriptedLLM(() => {
        throw new Error('provider down');
      }),
    });
    const { skill } = await skillWithCases(app, 2);
    const failed = await waitSkill(app, (await startSkillRun(app, skill.id)).json().run_id);
    expect(failed.status).toBe('failed');
    expect(failed).toMatchObject({
      evaluated_count: 0,
      errored_count: 2,
      passed_count: 0,
      recall: null,
      precision: null,
      citation_accuracy: null,
      cost_usd: null,
    });
    await app.close();
  });

  it('SK-11 / AC-11: pooled metrics and summed cost are stored on the run (unknown cost -> null)', async () => {
    let missFor = '';
    let unknownFor = '';
    const llm = new ScriptedLLM(({ caseName }) => ({
      review: caseName === missFor ? MISS_LINE_12 : REVIEW_ONE_HIT_ONE_DROP,
      costUsd: caseName === unknownFor ? null : 0.01,
    }));
    const app = await makeApp(pg, { llm });
    const { skill, cases } = await skillWithCases(app, 2);
    missFor = cases[1]!.name;

    const done = await waitSkill(app, (await startSkillRun(app, skill.id)).json().run_id);
    // c1: matched 1/1, grounded 1, noise 0, kept 1, dropped 1. c2: matched 0/1, grounded 1, noise 1, kept 1.
    expect(done.recall).toBeCloseTo(0.5, 10);
    expect(done.precision).toBeCloseTo(0.5, 10);
    expect(done.citation_accuracy).toBeCloseTo(2 / 3, 10);
    expect(done).toMatchObject({ passed_count: 1, evaluated_count: 2, errored_count: 0 });
    expect(done.cost_usd).toBeCloseTo(0.02, 10);

    unknownFor = cases[0]!.name;
    const unknown = await waitSkill(app, (await startSkillRun(app, skill.id)).json().run_id);
    expect(unknown.cost_usd).toBeNull();
    await app.close();
  });

  it('SK-12 / AC-12: each per-case result records the case input fingerprint', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const { skill, cases } = await skillWithCases(app, 2);
    const done = await waitSkill(app, (await startSkillRun(app, skill.id)).json().run_id);
    const rows = await db.select().from(t.evalRuns).where(eq(t.evalRuns.suiteRunId, done.id));
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.inputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(rows.map((r) => r.caseId))).toEqual(new Set(cases.map((c) => c.id)));
    await app.close();
  });

  it('SK-13 / AC-13: booting the app fails every still-running skill suite and draft run as "interrupted"', async () => {
    const app0 = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const { skill: s1 } = await skillWithCases(app0, 1);
    const { skill: s2 } = await skillWithCases(app0, 1);
    const suite = await insertSkillSuiteRun(db, ws, s1.id, { status: 'running', finishedAt: null, casesDone: 0 });
    const draft = await insertSkillSuiteRun(db, ws, s2.id, {
      status: 'running',
      finishedAt: null,
      isDraft: true,
      skillVersion: null,
      casesDone: 0,
    });
    expect((await startSkillRun(app0, s1.id)).statusCode).toBe(409); // lock held while "running"
    await app0.close();

    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) }); // buildApp awaits the reaper
    for (const id of [suite.id, draft.id]) {
      const reaped = await skillRun(app, id);
      expect(reaped.status).toBe('failed');
      expect(reaped.failure_reason).toBe('interrupted');
    }
    const retry = await startSkillRun(app, s1.id);
    expect(retry.statusCode).toBe(202);
    await waitSkill(app, retry.json().run_id);
    await app.close();
  });

  it('SK-14 / AC-14: a differing draft_body creates a draft run (no version) that executes the draft text; the text is not persisted', async () => {
    const llm = new ScriptedLLM(hit);
    const app = await makeApp(pg, { llm });
    const { skill } = await skillWithCases(app, 2, 'SAVED-TEXT');

    const res = await startSkillRun(app, skill.id, 'DRAFT-TEXT-XYZ');
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'running', cases_total: 2, is_draft: true });

    const done = await waitSkill(app, res.json().run_id);
    expect(done).toMatchObject({ status: 'completed', is_draft: true, skill_version: null, skill_id: skill.id, ...DEFAULT_MODEL });
    expect(done.results).toHaveLength(2);
    for (const req of llm.requests) {
      const text = JSON.stringify(req.messages);
      expect(text).toContain('DRAFT-TEXT-XYZ');
      expect(text).not.toContain('SAVED-TEXT');
    }
    // Draft text lives nowhere in the database.
    const [runRow] = await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, done.id));
    expect(JSON.stringify(runRow)).not.toContain('DRAFT-TEXT-XYZ');
    const versions = await db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, skill.id));
    expect(versions.map((v) => v.body)).toEqual(['SAVED-TEXT']);
    await app.close();
  });

  it('SK-15 / AC-15: a draft_body equal to the saved text starts a normal versioned suite run', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const { skill } = await skillWithCases(app, 1, 'same text');
    const res = await startSkillRun(app, skill.id, 'same text');
    expect(res.statusCode).toBe(202);
    expect(res.json().is_draft).toBe(false);
    const done = await waitSkill(app, res.json().run_id);
    expect(done).toMatchObject({ is_draft: false, skill_version: skill.version });
    await app.close();
  });

  it('SK-16 / AC-16: a new draft run deletes the previous draft run and its results; at most one draft is kept', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const { skill } = await skillWithCases(app, 2);

    const first = await waitSkill(app, (await startSkillRun(app, skill.id, 'draft one')).json().run_id);
    expect(first.results).toHaveLength(2);
    const second = await waitSkill(app, (await startSkillRun(app, skill.id, 'draft two')).json().run_id);

    expect((await app.inject({ method: 'GET', url: `/eval-suite-runs/${first.id}` })).statusCode).toBe(404);
    expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.suiteRunId, first.id))).toHaveLength(0);
    const drafts = await db
      .select()
      .from(t.evalSuiteRuns)
      .where(eq(t.evalSuiteRuns.skillId, skill.id));
    expect(drafts.filter((r) => r.isDraft).map((r) => r.id)).toEqual([second.id]);
    await app.close();
  });

  it('SK-17 / AC-17: draft runs never enter history, runs, the case latest result, stats or the dashboard', async () => {
    let miss = false;
    const llm = new ScriptedLLM(() => ({ review: miss ? MISS_LINE_12 : REVIEW_ONE_HIT_ONE_DROP }));
    const app = await makeApp(pg, { llm });
    const { skill, cases } = await skillWithCases(app, 1);

    const suite = await waitSkill(app, (await startSkillRun(app, skill.id)).json().run_id);
    miss = true;
    const draft = await waitSkill(app, (await startSkillRun(app, skill.id, 'degraded draft')).json().run_id);
    expect(draft.recall).toBe(0); // the draft really is worse (and newer)

    const list = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-runs` })).json();
    expect(list.runs.map((r: { id: string }) => r.id)).toEqual([suite.id]);
    expect(list.history.map((r: { id: string }) => r.id)).toEqual([suite.id]);
    expect(list.alert).toBeNull();

    const cl = (await app.inject({ method: 'GET', url: `/eval-cases?owner_kind=skill&owner_id=${skill.id}` })).json();
    expect(cl[0].id).toBe(cases[0]!.id);
    expect(cl[0].last_run.suite_run_id).toBe(suite.id);

    const stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-stats` })).json();
    expect(stats.latest_skill_run.id).toBe(suite.id);
    expect(stats.recall).toBe(1);
    expect(stats.case_results[0].suite_run_id).toBe(suite.id);

    const dash = (await app.inject({ method: 'GET', url: '/eval-dashboard/skills' })).json();
    const entry = dash.skills.find((s: { skill_id: string }) => s.skill_id === skill.id);
    expect(entry.latest_run.id).toBe(suite.id);
    expect(entry.history).toHaveLength(1);
    expect(dash.recent_runs.map((r: { id: string }) => r.id)).not.toContain(draft.id);
    await app.close();
  });

  it('SK-17 / AC-17: a newer draft does not take part in the regression alert', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const skill = await insertSkill(db, ws);
    const t0 = Date.now();
    await insertSkillSuiteRun(db, ws, skill.id, { skillVersion: 1, startedAt: new Date(t0 - 3000) });
    await insertSkillSuiteRun(db, ws, skill.id, { skillVersion: 2, startedAt: new Date(t0 - 2000) });
    await insertSkillSuiteRun(db, ws, skill.id, {
      isDraft: true,
      skillVersion: null,
      precision: 0.1,
      startedAt: new Date(t0 - 1000),
    });
    const list = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-runs` })).json();
    expect(list.alert).toBeNull();
    expect(list.runs).toHaveLength(2);
    await app.close();
  });

  it('SK-18 / AC-18: the list returns the latest draft run with progress and per-case results, or null', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const { skill } = await skillWithCases(app, 2);
    const url = `/skills/${skill.id}/eval-runs`;
    expect((await app.inject({ method: 'GET', url })).json().latest_draft).toBeNull();

    const draft = await waitSkill(app, (await startSkillRun(app, skill.id, 'draft')).json().run_id);
    const body = (await app.inject({ method: 'GET', url })).json();
    expect(body.latest_draft).toMatchObject({
      id: draft.id,
      is_draft: true,
      skill_version: null,
      status: 'completed',
      cases_done: 2,
      cases_total: 2,
      recall: 1,
    });
    expect(body.latest_draft.results).toHaveLength(2);
    expect(body.runs).toHaveLength(0);
    expect(body.cases_total).toBe(2);
    await app.close();
  });

  it('SK-19 / AC-19: a draft run leaves the skill text and version unchanged while starting, running and after finishing', async () => {
    const gate = deferred();
    const llm = new ScriptedLLM(async () => {
      await gate.promise;
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    });
    const app = await makeApp(pg, { llm });
    const { skill } = await skillWithCases(app, 1, 'saved');
    const snapshot = async () => {
      const [row] = await db.select().from(t.skills).where(eq(t.skills.id, skill.id));
      const versions = await db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, skill.id));
      return { body: row!.body, version: row!.version, versions: versions.length };
    };
    const before = await snapshot();

    const started = (await startSkillRun(app, skill.id, 'unsaved draft')).json();
    expect(await snapshot()).toEqual(before);
    gate.resolve();
    await waitSkill(app, started.run_id);
    expect(await snapshot()).toEqual(before);
    await app.close();
  });

  it('SK-20 / AC-20: stats return the latest finished suite run with pass x/y, deltas vs the previous one and each case latest result', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const { skill, cases } = await skillWithCases(app, 1);
    const t0 = Date.now();
    await insertSkillSuiteRun(db, ws, skill.id, {
      skillVersion: 1,
      recall: 0.5,
      precision: 0.6,
      citationAccuracy: 0.9,
      startedAt: new Date(t0 - 2000),
    });
    const latest = await insertSkillSuiteRun(db, ws, skill.id, {
      skillVersion: 2,
      recall: 0.8,
      precision: 0.6,
      citationAccuracy: null,
      passedCount: 3,
      evaluatedCount: 4,
      startedAt: new Date(t0 - 1000),
    });
    await insertSkillSuiteRun(db, ws, skill.id, { skillVersion: 3, status: 'failed', startedAt: new Date(t0) }); // failed runs do not count
    const single = (await app.inject({ method: 'POST', url: `/eval-cases/${cases[0]!.id}/run` })).json();

    const stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-stats` })).json();
    expect(stats.latest_skill_run).toMatchObject({ id: latest.id, skill_version: 2, owner_kind: 'skill' });
    expect(stats.latest_run).toBeNull();
    expect(stats).toMatchObject({ recall: 0.8, precision: 0.6, citation_accuracy: null, traces_passed: 3, traces_evaluated: 4 });
    expect(stats.delta.recall).toBeCloseTo(0.3, 6);
    expect(stats.delta.precision).toBeCloseTo(0, 6);
    expect(stats.delta.citation_accuracy).toBeNull();
    expect(stats).toMatchObject({ cases_total: 1, cases_evaluated: 1 });
    expect(stats.case_results.map((r: { id: string }) => r.id)).toEqual([single.id]);
    await app.close();
  });

  it('SK-21 / AC-21: the list honours range 7d/30d/90d/all, returns only non-draft runs newest first with version, model, pass x/y, errors, cost, status', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const skill = await insertSkill(db, ws);
    const day = 86_400_000;
    const now = Date.now();
    const mk = (ago: number, v: number, over = {}) =>
      insertSkillSuiteRun(db, ws, skill.id, { skillVersion: v, startedAt: new Date(now - ago * day), ...over });
    const r0 = await mk(0, 4, { model: 'm-latest', passedCount: 2, evaluatedCount: 3, erroredCount: 1, costUsd: 0.25 });
    const r10 = await mk(10, 3);
    const r40 = await mk(40, 2);
    const r100 = await mk(100, 1, { status: 'failed' });
    await insertSkillSuiteRun(db, ws, skill.id, { isDraft: true, skillVersion: null, startedAt: new Date(now) });

    const ids = async (range: string) =>
      ((await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-runs?range=${range}` })).json().runs as { id: string }[]).map(
        (r) => r.id,
      );
    expect(await ids('7d')).toEqual([r0.id]);
    expect(await ids('30d')).toEqual([r0.id, r10.id]);
    expect(await ids('90d')).toEqual([r0.id, r10.id, r40.id]);
    expect(await ids('all')).toEqual([r0.id, r10.id, r40.id, r100.id]);

    const runs = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-runs?range=7d` })).json().runs;
    expect(runs[0]).toMatchObject({
      skill_version: 4,
      provider: 'openrouter',
      model: 'm-latest',
      passed_count: 2,
      evaluated_count: 3,
      errored_count: 1,
      cost_usd: 0.25,
      status: 'completed',
      is_draft: false,
    });
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-runs?range=1y` })).statusCode).toBe(422);
    await app.close();
  });

  describe('compare', () => {
    it('SK-24 / AC-24: returns both runs, deltas (new minus old), both version texts, model before/after, model_changed and case-set / edited flags - ordered by version regardless of argument order', async () => {
      const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
      const { skill, cases } = await skillWithCases(app, 2, 'TEXT-V1');
      await saveSkillVersion(db, skill.id, 'TEXT-V2');
      const t0 = Date.now();
      const a = await insertSkillSuiteRun(db, ws, skill.id, {
        skillVersion: 1, model: 'm1', recall: 0.5, precision: 0.5, citationAccuracy: 0.5, costUsd: 0.1, startedAt: new Date(t0 - 2000),
      });
      const b = await insertSkillSuiteRun(db, ws, skill.id, {
        skillVersion: 2, model: 'm2', recall: 0.8, precision: 0.7, citationAccuracy: 0.5, costUsd: 0.3, startedAt: new Date(t0 - 1000),
      });
      const res = (k: string, fp: string) =>
        db.insert(t.evalRuns).values({ caseId: cases[0]!.id, suiteRunId: k, status: 'ok', pass: true, inputFingerprint: fp });
      await res(a.id, 'fp-before');
      await res(b.id, 'fp-after'); // case 0 edited between runs
      await db.insert(t.evalRuns).values({ caseId: cases[1]!.id, suiteRunId: b.id, status: 'ok', pass: true, inputFingerprint: 'x' });

      for (const [base, head] of [[a.id, b.id], [b.id, a.id]]) {
        const r = await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-runs/compare?base=${base}&head=${head}` });
        expect(r.statusCode).toBe(200);
        const body = r.json();
        expect(body.old.run).toMatchObject({ id: a.id, skill_version: 1, model: 'm1', provider: 'openrouter' });
        expect(body.new.run).toMatchObject({ id: b.id, skill_version: 2, model: 'm2', recall: 0.8 });
        expect(body.old.skill_text).toBe('TEXT-V1');
        expect(body.new.skill_text).toBe('TEXT-V2');
        expect(body.deltas.recall).toBeCloseTo(0.3, 6);
        expect(body.deltas.precision).toBeCloseTo(0.2, 6);
        expect(body.deltas.citation_accuracy).toBeCloseTo(0, 6);
        expect(body.deltas.cost_usd).toBeCloseTo(0.2, 6);
        expect(body.model_changed).toBe(true);
        expect(body.case_sets_differ).toEqual({ old_count: 1, new_count: 2 });
        expect(body.edited_cases).toBe(1);
      }
      await app.close();
    });

    it('SK-24 / AC-24: same model and equal case sets -> model_changed false, no differ flag', async () => {
      const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
      const { skill } = await skillWithCases(app, 1);
      const t0 = Date.now();
      const a = await insertSkillSuiteRun(db, ws, skill.id, { skillVersion: 1, startedAt: new Date(t0 - 2000) });
      const b = await insertSkillSuiteRun(db, ws, skill.id, { skillVersion: 1, startedAt: new Date(t0 - 1000) });
      const body = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-runs/compare?base=${b.id}&head=${a.id}` })).json();
      expect(body.old.run.id).toBe(a.id); // equal versions: start time decides (AC-25)
      expect(body.model_changed).toBe(false);
      expect(body.case_sets_differ).toBeNull();
      expect(body.edited_cases).toBe(0);
      await app.close();
    });

    it('SK-26 / AC-26: runs of different skills, a run of another skill than :id, or a draft run are rejected with 400', async () => {
      const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
      const sA = await insertSkill(db, ws);
      const sB = await insertSkill(db, ws);
      const a1 = await insertSkillSuiteRun(db, ws, sA.id);
      const a2 = await insertSkillSuiteRun(db, ws, sA.id, { skillVersion: 2 });
      const b1 = await insertSkillSuiteRun(db, ws, sB.id);
      const draft = await insertSkillSuiteRun(db, ws, sA.id, { isDraft: true, skillVersion: null });
      const cmp = (skill: string, base: string, head: string) =>
        app.inject({ method: 'GET', url: `/skills/${skill}/eval-runs/compare?base=${base}&head=${head}` });

      expect((await cmp(sA.id, a1.id, b1.id)).statusCode).toBe(400); // cross-skill
      expect((await cmp(sA.id, b1.id, b1.id)).statusCode).toBe(400); // both of another skill than :id
      expect((await cmp(sA.id, a1.id, draft.id)).statusCode).toBe(400); // draft
      expect((await cmp(sA.id, draft.id, a2.id)).statusCode).toBe(400);
      expect((await cmp(sA.id, a1.id, a2.id)).statusCode).toBe(200); // sanity
      expect((await cmp(sA.id, a1.id, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
      await app.close();
    });
  });

  it('SK-27 / AC-27: the dashboard lists every skill (incl. ones with no cases) with latest run, last-10 history, running progress and recent non-draft runs', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const empty = await insertSkill(db, ws);
    const { skill: busy } = await skillWithCases(app, 3);
    const { skill: hist } = await skillWithCases(app, 1);
    const { skill: draftOnly } = await skillWithCases(app, 1);
    const t0 = Date.now();
    for (let i = 1; i <= 12; i++) {
      await insertSkillSuiteRun(db, ws, hist.id, {
        skillVersion: i,
        recall: i / 20,
        startedAt: new Date(t0 + 60_000 - (12 - i) * 1000), // future-dated so they top 'recent runs'
      });
    }
    await insertSkillSuiteRun(db, ws, hist.id, { isDraft: true, skillVersion: null, recall: 0.99, startedAt: new Date(t0 + 61_000) });
    const running = await insertSkillSuiteRun(db, ws, busy.id, {
      status: 'running', finishedAt: null, casesTotal: 3, casesDone: 1,
    });
    await insertSkillSuiteRun(db, ws, draftOnly.id, {
      status: 'running', finishedAt: null, isDraft: true, skillVersion: null, casesTotal: 1, casesDone: 0,
    });

    const dash = (await app.inject({ method: 'GET', url: '/eval-dashboard/skills' })).json();
    const by = (id: string) => dash.skills.find((s: { skill_id: string }) => s.skill_id === id);

    expect(by(empty.id)).toMatchObject({ cases_total: 0, latest_run: null, history: [], running_run: null, enabled: true, scan_status: 'clean' });
    expect(by(busy.id)).toMatchObject({ cases_total: 3, running_run: { id: running.id, cases_done: 1, cases_total: 3 } });
    expect(by(draftOnly.id).running_run).toBeNull(); // a running draft is not surfaced
    const h = by(hist.id);
    expect(h.cases_total).toBe(1);
    expect(h.latest_run).toMatchObject({ skill_version: 12, recall: 0.6, owner_kind: 'skill' });
    expect(h.history).toHaveLength(10);
    expect(h.history[9].recall).toBe(0.6); // chronological, newest last
    expect(h.history[0].recall).toBe(0.15);
    expect(dash.recent_runs.length).toBeGreaterThan(0);
    expect(dash.recent_runs.every((r: { is_draft: boolean; skill_name: string }) => !r.is_draft && typeof r.skill_name === 'string')).toBe(true);
    expect(dash.recent_runs[0]).toMatchObject({ skill_name: hist.name, skill_version: 12 });

    await db.update(t.evalSuiteRuns).set({ status: 'failed' }).where(inArray(t.evalSuiteRuns.id, [running.id]));
    await db.delete(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.skillId, draftOnly.id));
    await app.close();
  });

  it('SK-28 / AC-28: run-all starts every skill with cases (disabled included), skips scan-blocked and already-running skills, and executes the skills one after another', async () => {
    const gate = deferred();
    const llm = new ScriptedLLM(async () => {
      await gate.promise;
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    });
    const app = await makeApp(pg, { llm });
    await db.delete(t.evalCases); // isolate from seeded demo data
    const { skill: s1 } = await skillWithCases(app, 1);
    const { skill: disabled } = await skillWithCases(app, 1, undefined, { enabled: false });
    const { skill: pending } = await skillWithCases(app, 1, undefined, { scanStatus: 'pending' });
    const { skill: flagged } = await skillWithCases(app, 1, undefined, {
      scanStatus: 'flagged',
      scanFindings: [{ severity: 'critical', category: 'exfiltration', excerpt: 'x', location: 'l', explanation: 'e' }],
    });
    const { skill: errored } = await skillWithCases(app, 1, undefined, { scanStatus: 'error' });
    const { skill: busy } = await skillWithCases(app, 1);
    const noCases = await insertSkill(db, ws);
    const running = await insertSkillSuiteRun(db, ws, busy.id, { status: 'running', finishedAt: null, casesDone: 0, casesTotal: 1 });

    const res = await app.inject({ method: 'POST', url: '/eval-dashboard/skills/run-all' });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect([...body.started].sort()).toEqual([s1.id, disabled.id].sort());
    expect([...body.skipped].sort()).toEqual([pending.id, flagged.id, errored.id, busy.id].sort());
    expect([...body.started, ...body.skipped]).not.toContain(noCases.id);

    // Rows are inserted up front (both running), but only ONE model call is in flight at a time.
    const runRows = async () => db.select().from(t.evalSuiteRuns).where(inArray(t.evalSuiteRuns.skillId, [s1.id, disabled.id]));
    expect((await runRows()).map((r) => [r.status, r.isDraft, r.skillVersion !== null])).toEqual([
      ['running', false, true],
      ['running', false, true],
    ]);
    await until(() => llm.callCount >= 1);
    await sleep(150);
    expect(llm.callCount).toBe(1);

    gate.resolve();
    for (const r of await runRows()) expect((await waitSkill(app, r.id)).status).toBe('completed');
    expect(llm.callCount).toBe(2);
    expect((await getRun(app, running.id)).status).toBe('running'); // untouched
    for (const id of [pending.id, flagged.id, errored.id]) {
      expect(await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.skillId, id))).toHaveLength(0);
    }
    await db.update(t.evalSuiteRuns).set({ status: 'failed' }).where(eq(t.evalSuiteRuns.id, running.id));
    await app.close();
  });

  it('SK-28: a running DRAFT run also makes the skill skipped by run-all', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    await db.delete(t.evalCases);
    const { skill } = await skillWithCases(app, 1);
    const draft = await insertSkillSuiteRun(db, ws, skill.id, {
      status: 'running', finishedAt: null, isDraft: true, skillVersion: null, casesDone: 0,
    });
    const body = (await app.inject({ method: 'POST', url: '/eval-dashboard/skills/run-all' })).json();
    expect(body).toEqual({ started: [], skipped: [skill.id] });
    await db.update(t.evalSuiteRuns).set({ status: 'failed' }).where(eq(t.evalSuiteRuns.id, draft.id));
    await app.close();
  });

  it('SK-35 / AC-35: deleting a skill deletes its cases, their results and all its suite and draft runs (other owners are untouched)', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const { skill, cases } = await skillWithCases(app, 2);
    const { skill: keep, cases: keepCases } = await skillWithCases(app, 1);
    const agent = await makeAgent(app);
    const agentCase = await makeCase(app, agent.id);
    const suite = await waitSkill(app, (await startSkillRun(app, skill.id)).json().run_id);
    const draft = await waitSkill(app, (await startSkillRun(app, skill.id, 'draft')).json().run_id);
    await app.inject({ method: 'POST', url: `/eval-cases/${cases[0]!.id}/run` }); // a single-case result too
    await waitSkill(app, (await startSkillRun(app, keep.id)).json().run_id);

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.statusCode).toBe(200);

    const caseIds = cases.map((c) => c.id);
    expect(await db.select().from(t.evalCases).where(inArray(t.evalCases.id, caseIds))).toHaveLength(0);
    expect(await db.select().from(t.evalRuns).where(inArray(t.evalRuns.caseId, caseIds))).toHaveLength(0);
    expect(await db.select().from(t.evalSuiteRuns).where(inArray(t.evalSuiteRuns.id, [suite.id, draft.id]))).toHaveLength(0);
    expect(await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.skillId, skill.id))).toHaveLength(0);

    expect(await db.select().from(t.evalCases).where(inArray(t.evalCases.id, [keepCases[0]!.id, agentCase.id]))).toHaveLength(2);
    expect(await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.skillId, keep.id))).toHaveLength(1);
    await app.close();
  });

  it('SK-36 / AC-36: deleting a skill while its run is running stops execution before the next case and writes nothing further', async () => {
    const gate = deferred();
    const llm = new ScriptedLLM(async ({ call }) => {
      if (call === 1) await gate.promise;
      return { review: REVIEW_ONE_HIT_ONE_DROP };
    });
    const app = await makeApp(pg, { llm });
    const { skill, cases } = await skillWithCases(app, 3);
    const started = (await startSkillRun(app, skill.id)).json();
    await until(() => llm.callCount === 1);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    gate.resolve();
    await sleep(500); // give the background loop every chance to (wrongly) continue

    expect(llm.callCount).toBe(1); // cases 2 and 3 never started
    expect(await db.select().from(t.evalRuns).where(inArray(t.evalRuns.caseId, cases.map((c) => c.id)))).toHaveLength(0);
    expect(await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, started.run_id))).toHaveLength(0);
    await app.close();
  });

  it('SK-37 / AC-37: the old POST /skills/:id/eval-cases/run-all route is gone (404)', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    const { skill } = await skillWithCases(app, 1);
    const res = await app.inject({ method: 'POST', url: `/skills/${skill.id}/eval-cases/run-all` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('guard: agent dashboard, agent run-all, agent history and agent DTOs ignore skill runs and carry owner_kind "agent"', async () => {
    const app = await makeApp(pg, { llm: new ScriptedLLM(hit) });
    await db.delete(t.evalCases);
    const agent = await makeAgent(app);
    await makeCase(app, agent.id);
    const skill = await insertSkill(db, ws);
    const skillRunning = await insertSkillSuiteRun(db, ws, skill.id, { status: 'running', finishedAt: null, casesDone: 0 });
    await insertSkillSuiteRun(db, ws, skill.id, { skillVersion: 5 });

    const all = (await app.inject({ method: 'POST', url: '/eval-dashboard/run-all' })).json();
    expect(all).toEqual({ started: [agent.id], skipped: [] });
    const [row] = await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, agent.id));
    const run = await waitForSuite(app, row!.id);
    expect(run).toMatchObject({ status: 'completed', owner_kind: 'agent' });

    const dash = (await app.inject({ method: 'GET', url: '/eval-dashboard' })).json();
    const recentIds = dash.recent_runs.map((r: { id: string }) => r.id);
    expect(recentIds).toContain(run.id);
    expect(recentIds).not.toContain(skillRunning.id);
    expect(dash.recent_runs.every((r: { owner_kind: string; skill_id?: string }) => r.owner_kind === 'agent' && r.skill_id === undefined)).toBe(true);
    expect(dash.agents.find((a: { agent_id: string }) => a.agent_id === agent.id).running_run).toBeNull();

    const hist = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
    expect(hist.runs.map((r: { id: string }) => r.id)).toEqual([run.id]);
    expect(hist.history[0].owner_kind).toBe('agent');
    expect(hist.alert).toBeNull();
    const stats = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-stats` })).json();
    expect(stats.latest_run.owner_kind).toBe('agent');
    expect(stats.latest_skill_run).toBeUndefined();

    await db.update(t.evalSuiteRuns).set({ status: 'failed' }).where(eq(t.evalSuiteRuns.id, skillRunning.id));
    await app.close();
  });
});
