import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  defaultWorkspaceId,
  eq,
  insertFindingFixture,
  insertSkill,
  linkSkill,
  makeAgent,
  makeApp,
} from './helpers/eval-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * SPEC-08 SF-AC-29..34 (+ amended SPEC-02 AC-7 / AC-12) - "Turn into eval case"
 * with an optional `target` (agent default, or a skill linked to the finding's agent).
 * Ring 2: real Postgres (per-target unique index) + mocked ports.
 */
d('POST /findings/:id/eval-case with a skill target (Testcontainers pg)', () => {
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

  const post = (app: Awaited<ReturnType<typeof makeApp>>, findingId: string, body?: unknown) =>
    app.inject({
      method: 'POST',
      url: `/findings/${findingId}/eval-case`,
      ...(body !== undefined ? { payload: body as object } : {}),
    });
  const casesFor = (findingId: string) =>
    db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, findingId));

  it('SF-29 / AC-29: an accepted finding with a skill target creates a skill-owned must_find case with the same expected entry, frozen hunk, PR meta and default name as an agent case', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const skill = await insertSkill(db, ws);
    await linkSkill(db, agent.id, skill.id);
    const { finding } = await insertFindingFixture(db, ws, { agentId: agent.id, decision: 'accepted' });

    const res = await post(app, finding.id, { target: { kind: 'skill', id: skill.id } });
    expect(res.statusCode).toBe(201);
    const c = res.json();
    expect(c).toMatchObject({
      owner_kind: 'skill',
      owner_id: skill.id,
      kind: 'must_find',
      source: 'finding_accepted',
      source_finding_id: finding.id,
      name: 'debug-flag-left-on-in-production',
    });
    expect(c.expected_output).toEqual([
      { file: 'src/config.ts', start_line: 51, end_line: 52, severity: 'CRITICAL', category: 'security', title: 'Debug flag left on in production!' },
    ]);
    expect(c.input_diff).toContain('@@ -50,3 +51,4 @@');
    expect(c.input_diff).not.toContain('@@ -10,3 +10,4 @@');
    expect(c.input_diff).not.toContain('src/other.ts');
    expect(c.input_meta).toEqual({ title: 'Add Stripe billing', body: 'Wires up Stripe.' });
    await app.close();
  });

  it('SF-29 / AC-29: a dismissed finding with a skill target creates a must_not_flag case with one forbidden location', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const skill = await insertSkill(db, ws);
    await linkSkill(db, agent.id, skill.id);
    const { finding } = await insertFindingFixture(db, ws, { agentId: agent.id, decision: 'dismissed' });

    const c = (await post(app, finding.id, { target: { kind: 'skill', id: skill.id } })).json();
    expect(c).toMatchObject({ owner_kind: 'skill', owner_id: skill.id, kind: 'must_not_flag', source: 'finding_dismissed' });
    expect(c.expected_output).toEqual([{ file: 'src/config.ts', start_line: 51, end_line: 52 }]);
    await app.close();
  });

  it('SF-29: an undecided finding is still rejected (400) for a skill target', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const skill = await insertSkill(db, ws);
    await linkSkill(db, agent.id, skill.id);
    const { finding } = await insertFindingFixture(db, ws, { agentId: agent.id, decision: null });
    const res = await post(app, finding.id, { target: { kind: 'skill', id: skill.id } });
    expect(res.statusCode).toBe(400);
    expect(await casesFor(finding.id)).toHaveLength(0);
    await app.close();
  });

  it('SF-30 / AC-30: a skill not linked to the finding agent is rejected with 400 and creates no case (another agent link does not count)', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const otherAgent = await makeAgent(app);
    const unlinked = await insertSkill(db, ws);
    const linkedToOther = await insertSkill(db, ws);
    await linkSkill(db, otherAgent.id, linkedToOther.id);
    const { finding } = await insertFindingFixture(db, ws, { agentId: agent.id, decision: 'accepted' });

    for (const skill of [unlinked, linkedToOther]) {
      const res = await post(app, finding.id, { target: { kind: 'skill', id: skill.id } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('skill_not_linked');
    }
    expect(await casesFor(finding.id)).toHaveLength(0);
    await app.close();
  });

  it('SF-30: an agent target that is not the finding agent is rejected with 400; the finding agent itself is accepted', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const other = await makeAgent(app);
    const { finding } = await insertFindingFixture(db, ws, { agentId: agent.id, decision: 'accepted' });

    const bad = await post(app, finding.id, { target: { kind: 'agent', id: other.id } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_target');
    expect(await casesFor(finding.id)).toHaveLength(0);

    const ok = await post(app, finding.id, { target: { kind: 'agent', id: agent.id } });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ owner_kind: 'agent', owner_id: agent.id });
    await app.close();
  });

  it('SF-31 / AC-31: a second request for the same finding and target answers 409 with the existing case id; a different target is allowed', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const skill = await insertSkill(db, ws);
    const skill2 = await insertSkill(db, ws);
    await linkSkill(db, agent.id, skill.id);
    await linkSkill(db, agent.id, skill2.id, 1);
    const { finding } = await insertFindingFixture(db, ws, { agentId: agent.id, decision: 'accepted' });
    const target = { target: { kind: 'skill', id: skill.id } };

    const first = await post(app, finding.id, target);
    expect(first.statusCode).toBe(201);
    const dup = await post(app, finding.id, target);
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.details).toEqual({ case_id: first.json().id });

    // Different targets (the agent, another skill) are still allowed for the same finding.
    expect((await post(app, finding.id)).statusCode).toBe(201);
    expect((await post(app, finding.id, { target: { kind: 'skill', id: skill2.id } })).statusCode).toBe(201);
    expect(await casesFor(finding.id)).toHaveLength(3);

    // ...and each one 409s on its own repeat, pointing at its own case.
    const agentDup = await post(app, finding.id);
    expect(agentDup.statusCode).toBe(409);
    expect(agentDup.json().error.details.case_id).not.toBe(first.json().id);
    await app.close();
  });

  it('SF-31: concurrent requests for the same skill target are race-proof - exactly one case, the rest 409', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const skill = await insertSkill(db, ws);
    await linkSkill(db, agent.id, skill.id);
    const { finding } = await insertFindingFixture(db, ws, { agentId: agent.id, decision: 'accepted' });

    const results = await Promise.all(
      [1, 2, 3].map(() => post(app, finding.id, { target: { kind: 'skill', id: skill.id } })),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    expect(await casesFor(finding.id)).toHaveLength(1);
    await app.close();
  });

  it('SF-32 / AC-32: no target (no body, or an empty object) targets the finding agent', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    for (const body of [undefined, {}]) {
      const { finding } = await insertFindingFixture(db, ws, { agentId: agent.id, decision: 'accepted' });
      const res = await post(app, finding.id, body);
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ owner_kind: 'agent', owner_id: agent.id });
    }
    await app.close();
  });

  it.each([
    ['pending', { scanStatus: 'pending' as const }],
    ['error', { scanStatus: 'error' as const }],
    [
      'flagged (critical)',
      {
        scanStatus: 'flagged' as const,
        scanFindings: [{ severity: 'critical', category: 'exfiltration', excerpt: 'x', location: 'l', explanation: 'e' }],
      },
    ],
  ])('SF-33 / AC-33: a target skill whose scan is %s still gets the case', async (_name, over) => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const skill = await insertSkill(db, ws, undefined, 'body', over);
    await linkSkill(db, agent.id, skill.id);
    const { finding } = await insertFindingFixture(db, ws, { agentId: agent.id, decision: 'accepted' });
    const res = await post(app, finding.id, { target: { kind: 'skill', id: skill.id } });
    expect(res.statusCode).toBe(201);
    expect(res.json().owner_id).toBe(skill.id);
    await app.close();
  });

  it('SF-34 / AC-34: the PR review listing and accept/dismiss responses carry every eval case of a finding with target kind, target id and case id; eval_case_id stays the agent case', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const skill = await insertSkill(db, ws);
    await linkSkill(db, agent.id, skill.id);
    const withCases = await insertFindingFixture(db, ws, { agentId: agent.id, decision: 'accepted' });
    const skillCase = (await post(app, withCases.finding.id, { target: { kind: 'skill', id: skill.id } })).json();
    const agentCase = (await post(app, withCases.finding.id)).json();
    const [bare] = await db
      .insert(t.findings)
      .values({
        reviewId: withCases.review.id,
        file: 'src/other.ts',
        startLine: 2,
        endLine: 2,
        severity: 'INFO',
        category: 'style',
        title: 'Nit',
        rationale: 'r',
        confidence: 0.5,
      })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/pulls/${withCases.pr.id}/reviews` });
    expect(res.statusCode).toBe(200);
    type F = { id: string; eval_case_id: string | null; eval_cases: { case_id: string; target_kind: string; target_id: string }[] };
    const findings: F[] = res.json().flatMap((r: { findings: F[] }) => r.findings);
    const f = findings.find((x) => x.id === withCases.finding.id)!;
    expect(f.eval_cases).toEqual([
      { case_id: skillCase.id, target_kind: 'skill', target_id: skill.id },
      { case_id: agentCase.id, target_kind: 'agent', target_id: agent.id },
    ]);
    expect(f.eval_case_id).toBe(agentCase.id);
    const none = findings.find((x) => x.id === bare!.id)!;
    expect(none.eval_cases).toEqual([]);
    expect(none.eval_case_id).toBeNull();

    const act = await app.inject({ method: 'POST', url: `/findings/${withCases.finding.id}/accept` });
    expect(act.json().finding.eval_cases).toHaveLength(2);
    expect(act.json().finding.eval_case_id).toBe(agentCase.id);
    await app.close();
  });

  it('SF-34: a finding with only a skill case has eval_case_id null but lists the skill case', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const skill = await insertSkill(db, ws);
    await linkSkill(db, agent.id, skill.id);
    const { finding, pr } = await insertFindingFixture(db, ws, { agentId: agent.id, decision: 'accepted' });
    const c = (await post(app, finding.id, { target: { kind: 'skill', id: skill.id } })).json();

    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    const f = reviews[0].findings.find((x: { id: string }) => x.id === finding.id);
    expect(f.eval_case_id).toBeNull();
    expect(f.eval_cases).toEqual([{ case_id: c.id, target_kind: 'skill', target_id: skill.id }]);
    await app.close();
  });
});
