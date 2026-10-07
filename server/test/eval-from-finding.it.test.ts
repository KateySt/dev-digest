import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  DIFF,
  defaultWorkspaceId,
  eq,
  insertFindingFixture,
  makeAgent,
  makeApp,
} from './helpers/eval-fixtures.js';
import { MockGitClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * SPEC-02 S-AC-1..7, 10, 11, 12 — "Turn into eval case" (POST /findings/:id/eval-case),
 * the generic create endpoint's source/kind, and the finding DTO's eval_case_id.
 * Ring 2: real Postgres (partial unique index, FK SET NULL) + mocked ports.
 */
d('POST /findings/:id/eval-case (Testcontainers pg)', () => {
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

  it('S-1/S-3/S-4: accepted finding -> agent-owned must_find case with one expected entry and frozen hunk + PR meta', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id, decision: 'accepted' });

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(201);
    const c = res.json();

    expect(c).toMatchObject({
      owner_kind: 'agent',
      owner_id: agent.id,
      kind: 'must_find',
      source: 'finding_accepted',
      source_finding_id: finding.id,
      name: 'debug-flag-left-on-in-production', // S-8 default name
    });
    expect(c.expected_output).toEqual([
      {
        file: 'src/config.ts',
        start_line: 51,
        end_line: 52,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Debug flag left on in production!',
      },
    ]);
    // Only the hunk containing lines 51-52 of THAT file is frozen.
    expect(c.input_diff).toContain('@@ -50,3 +51,4 @@');
    expect(c.input_diff).toContain('+  debug: true,');
    expect(c.input_diff).not.toContain('@@ -10,3 +10,4 @@');
    expect(c.input_diff).not.toContain('src/other.ts');
    expect(c.input_meta).toEqual({ title: 'Add Stripe billing', body: 'Wires up Stripe.' });
    await app.close();
  });

  it('S-2: dismissed finding -> must_not_flag case with one forbidden location (file + lines only)', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id, decision: 'dismissed' });

    const c = (await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` })).json();
    expect(c).toMatchObject({ kind: 'must_not_flag', source: 'finding_dismissed', owner_id: agent.id });
    expect(c.expected_output).toEqual([{ file: 'src/config.ts', start_line: 51, end_line: 52 }]);
    await app.close();
  });

  it('S-9: a full-file finding (secret_leak) freezes ALL hunks of its file and locates the whole file', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const { finding } = await insertFindingFixture(pg.handle.db, ws, {
      agentId: agent.id,
      decision: 'accepted',
      finding: { kind: 'secret_leak', startLine: 0, endLine: 0, title: 'Secret' },
    });

    const c = (await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` })).json();
    expect(c.input_diff).toContain('@@ -10,3 +10,4 @@');
    expect(c.input_diff).toContain('@@ -50,3 +51,4 @@');
    expect(c.input_diff).not.toContain('src/other.ts');
    expect(c.expected_output[0]).toMatchObject({ file: 'src/config.ts', start_line: 1 });
    expect(c.expected_output[0].end_line).toBeGreaterThan(10_000);
    await app.close();
  });

  it('S-3: falls back to persisted pr_files patches when git yields no diff', async () => {
    const app = await makeApp(pg, { git: new MockGitClient({ diff: '' }) });
    const agent = await makeAgent(app);
    const patch = '@@ -50,3 +51,4 @@\n   a: 1,\n+  debug: true,\n   b: 2';
    const { finding } = await insertFindingFixture(pg.handle.db, ws, {
      agentId: agent.id,
      decision: 'accepted',
      patch,
    });

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(201);
    expect(res.json().input_diff).toContain('+  debug: true,');
    await app.close();
  });

  it('S-5: a finding whose review has no agent is rejected with 400 and creates no case', async () => {
    const app = await makeApp(pg);
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: null, decision: 'accepted' });

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(400);
    const rows = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding.id));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('S-6: an undecided finding is rejected with 400 and creates no case', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id, decision: null });

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('finding_undecided');
    const rows = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding.id));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('S-7 / AC-31: a second request (same finding, default agent target) answers 409 with the existing case id and creates no second case', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id, decision: 'accepted' });

    const first = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    const second = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.details).toEqual({ case_id: first.json().id });
    const rows = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding.id));
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('S-7: concurrent requests are race-proof (unique index) - exactly one case, the rest 409', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id, decision: 'accepted' });

    const results = await Promise.all(
      [1, 2, 3].map(() => app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` })),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    const rows = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding.id));
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('S-10: deleting the finding keeps the case and its frozen inputs, clearing only the link', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id, decision: 'accepted' });
    const created = (await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` })).json();

    await pg.handle.db.delete(t.findings).where(eq(t.findings.id, finding.id));

    const kept = (await app.inject({ method: 'GET', url: `/eval-cases/${created.id}` })).json();
    expect(kept.source_finding_id).toBeNull();
    expect(kept.input_diff).toBe(created.input_diff);
    expect(kept.expected_output).toEqual(created.expected_output);
    expect(kept.source).toBe('finding_accepted');
    await app.close();
  });

  it('S-10: deleting the PR (cascading review + finding) also keeps the case', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const { finding, pr } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id, decision: 'dismissed' });
    const created = (await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` })).json();

    await pg.handle.db.delete(t.pullRequests).where(eq(t.pullRequests.id, pr.id));

    const kept = await app.inject({ method: 'GET', url: `/eval-cases/${created.id}` });
    expect(kept.statusCode).toBe(200);
    expect(kept.json().source_finding_id).toBeNull();
    await app.close();
  });

  it('S-11: the generic create endpoint records source manual and accepts either kind', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const mk = (kind?: string) =>
      app.inject({
        method: 'POST',
        url: '/eval-cases',
        payload: { owner_kind: 'agent', owner_id: agent.id, name: `c-${kind ?? 'default'}`, input_diff: DIFF, ...(kind ? { kind } : {}) },
      });

    const def = (await mk()).json();
    expect(def).toMatchObject({ source: 'manual', kind: 'must_find', source_finding_id: null });
    const nf = (await mk('must_not_flag')).json();
    expect(nf).toMatchObject({ source: 'manual', kind: 'must_not_flag' });
    expect((await mk('bogus')).statusCode).toBe(422);
    await app.close();
  });

  it('S-12: PR review listing includes eval_case_id for a finding with a case, null otherwise', async () => {
    const app = await makeApp(pg);
    const agent = await makeAgent(app);
    const withCase = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id, decision: 'accepted' });
    const created = (await app.inject({ method: 'POST', url: `/findings/${withCase.finding.id}/eval-case` })).json();
    // A second finding in the same review, without a case.
    const [other] = await pg.handle.db
      .insert(t.findings)
      .values({
        reviewId: withCase.review.id,
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

    const res = await app.inject({ method: 'GET', url: `/pulls/${withCase.pr.id}/reviews` });
    expect(res.statusCode).toBe(200);
    const findings = res.json().flatMap((r: { findings: { id: string; eval_case_id: string | null }[] }) => r.findings);
    expect(findings.find((f: { id: string }) => f.id === withCase.finding.id).eval_case_id).toBe(created.id);
    expect(findings.find((f: { id: string }) => f.id === other!.id).eval_case_id).toBeNull();
    // SPEC-08 AC-12: per-target list (agent target here); empty when no case.
    expect(findings.find((f: { id: string }) => f.id === withCase.finding.id).eval_cases).toEqual([
      { case_id: created.id, target_kind: 'agent', target_id: agent.id },
    ]);
    expect(findings.find((f: { id: string }) => f.id === other!.id).eval_cases).toEqual([]);

    // accept/dismiss responses carry it too.
    const act = await app.inject({ method: 'POST', url: `/findings/${withCase.finding.id}/accept` });
    expect(act.json().finding.eval_case_id).toBe(created.id);
    expect(act.json().finding.eval_cases).toEqual([{ case_id: created.id, target_kind: 'agent', target_id: agent.id }]);
    await app.close();
  });
});
