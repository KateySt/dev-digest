import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  EvalCaseRow,
  EvalRunRow,
  EvalSuiteRunRow,
  FindingRow,
  PullRow,
} from '../../db/rows.js';

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: 'skill' | 'agent';
  ownerId: string;
  name: string;
  kind?: 'must_find' | 'must_not_flag';
  source?: 'manual' | 'finding_accepted' | 'finding_dismissed';
  sourceFindingId?: string | null;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput?: unknown;
  notes?: string;
}

export interface UpdateEvalCase {
  name?: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput?: unknown;
  notes?: string;
}

export interface InsertEvalRun {
  caseId: string;
  suiteRunId?: string | null;
  status?: 'ok' | 'errored';
  error?: string | null;
  actualOutput?: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
  inputFingerprint?: string | null;
  expectedTotal?: number | null;
  matched?: number | null;
  groundedTotal?: number | null;
  noise?: number | null;
  kept?: number | null;
  dropped?: number | null;
}

export interface FinishSuiteRun {
  status: 'completed' | 'failed';
  failureReason?: string | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  passedCount: number;
  evaluatedCount: number;
  erroredCount: number;
  durationMs: number;
  costUsd: number | null;
}

/** A finding with the review + PR (+ repo) it belongs to — everything the
 *  "turn into eval case" flow needs, read-only. */
export interface FindingEvalContext {
  finding: FindingRow;
  review: typeof t.reviews.$inferSelect;
  pull: PullRow;
  repo: typeof t.repos.$inferSelect;
}

/** A suite run joined with its agent's name (cross-agent dashboard). */
export interface SuiteRunWithAgent {
  run: EvalSuiteRunRow;
  agentName: string;
}

/** A skill suite run joined with its skill's name (cross-skill dashboard). */
export interface SuiteRunWithSkill {
  run: EvalSuiteRunRow;
  skillName: string;
}

/** A per-case result of a suite run joined with the case name. */
export interface SuiteCaseResult {
  run: EvalRunRow;
  caseName: string | null;
}

/**
 * Eval data-access. Owns `eval_cases`, `eval_runs`, `eval_suite_runs`.
 * Data access only — "already running / no cases / missing" decisions live in
 * service.ts. `eval_runs` has no `workspaceId` of its own — workspace-scoped
 * queries over it join through `eval_cases`.
 */
export class EvalRepository {
  constructor(private db: Db) {}

  // ---- cases --------------------------------------------------------------

  async listCases(workspaceId: string, ownerKind: string, ownerId: string): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind as 'skill' | 'agent'),
          eq(t.evalCases.ownerId, ownerId),
        ),
      )
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.name));
  }

  /** Case counts per agent owner (agents with no cases are absent). */
  async caseCountsByAgent(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ ownerId: t.evalCases.ownerId, n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
      .groupBy(t.evalCases.ownerId);
    return new Map(rows.map((r) => [r.ownerId, r.n]));
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  /** Case counts per skill owner (skills with no cases are absent). */
  async caseCountsBySkill(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ ownerId: t.evalCases.ownerId, n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'skill')))
      .groupBy(t.evalCases.ownerId);
    return new Map(rows.map((r) => [r.ownerId, r.n]));
  }

  /** The case seeded from `findingId` for one target (a finding can seed one case per target). */
  async getCaseBySourceFinding(
    workspaceId: string,
    findingId: string,
    ownerKind: 'skill' | 'agent',
    ownerId: string,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.sourceFindingId, findingId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      );
    return row;
  }

  /** Every case seeded from the given findings (any target), oldest first. */
  async casesForFindings(
    workspaceId: string,
    findingIds: string[],
  ): Promise<{ findingId: string; caseId: string; ownerKind: 'skill' | 'agent'; ownerId: string }[]> {
    if (findingIds.length === 0) return [];
    const rows = await this.db
      .select({
        findingId: t.evalCases.sourceFindingId,
        caseId: t.evalCases.id,
        ownerKind: t.evalCases.ownerKind,
        ownerId: t.evalCases.ownerId,
      })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), inArray(t.evalCases.sourceFindingId, findingIds)))
      .orderBy(asc(t.evalCases.createdAt));
    return rows.map((r) => ({ ...r, findingId: r.findingId! }));
  }

  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        name: values.name,
        kind: values.kind ?? 'must_find',
        source: values.source ?? 'manual',
        sourceFindingId: values.sourceFindingId ?? null,
        inputDiff: values.inputDiff ?? null,
        inputFiles: (values.inputFiles as object | undefined) ?? null,
        inputMeta: (values.inputMeta as object | undefined) ?? null,
        expectedOutput: (values.expectedOutput as object | undefined) ?? null,
        notes: values.notes ?? null,
      })
      .returning();
    return row!;
  }

  async updateCase(workspaceId: string, id: string, patch: UpdateEvalCase): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.inputDiff !== undefined ? { inputDiff: patch.inputDiff } : {}),
        ...(patch.inputFiles !== undefined ? { inputFiles: patch.inputFiles as object } : {}),
        ...(patch.inputMeta !== undefined ? { inputMeta: patch.inputMeta as object } : {}),
        ...(patch.expectedOutput !== undefined ? { expectedOutput: patch.expectedOutput as object } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  /** Delete every case an owner (skill/agent) has - `eval_cases.owner_id` has no FK, so owner
   *  deletion calls this (pass the owner delete's `tx` as `executor`). Results cascade via FK. */
  async deleteCasesForOwner(
    workspaceId: string,
    ownerKind: 'skill' | 'agent',
    ownerId: string,
    executor: DbExecutor = this.db,
  ): Promise<void> {
    await executor
      .delete(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      );
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  // ---- finding -> review -> PR -> repo (read-only cross-module lookup) -----

  /** A finding with its review, PR and repo, scoped to the workspace (via the
   *  PR) so one tenant can't seed cases from another's findings. */
  async findingContext(workspaceId: string, findingId: string): Promise<FindingEvalContext | undefined> {
    const [row] = await this.db
      .select({
        finding: t.findings,
        review: t.reviews,
        pull: t.pullRequests,
        repo: t.repos,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.findings.id, findingId), eq(t.pullRequests.workspaceId, workspaceId)));
    return row;
  }

  // ---- single-case runs / per-case results ---------------------------------

  async insertRun(values: InsertEvalRun): Promise<EvalRunRow> {
    const [row] = await this.db
      .insert(t.evalRuns)
      .values({
        caseId: values.caseId,
        suiteRunId: values.suiteRunId ?? null,
        status: values.status ?? 'ok',
        error: values.error ?? null,
        actualOutput: (values.actualOutput as object | undefined) ?? null,
        pass: values.pass,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
        inputFingerprint: values.inputFingerprint ?? null,
        expectedTotal: values.expectedTotal ?? null,
        matched: values.matched ?? null,
        groundedTotal: values.groundedTotal ?? null,
        noise: values.noise ?? null,
        kept: values.kept ?? null,
        dropped: values.dropped ?? null,
      })
      .returning();
    return row!;
  }

  /** Most recent run per case (any run, suite or single), batched. Results that
   *  belong to a skill DRAFT run are excluded (SPEC-08 AC-17); single-case results
   *  (no suite link) still count. Cases with no runs have no entry in the map. */
  async latestRunsForCases(caseIds: string[]): Promise<Map<string, EvalRunRow>> {
    if (caseIds.length === 0) return new Map();
    const rows = await this.db
      .select({ run: t.evalRuns })
      .from(t.evalRuns)
      .leftJoin(t.evalSuiteRuns, eq(t.evalSuiteRuns.id, t.evalRuns.suiteRunId))
      .where(
        and(
          inArray(t.evalRuns.caseId, caseIds),
          or(isNull(t.evalRuns.suiteRunId), eq(t.evalSuiteRuns.isDraft, false)),
        ),
      )
      .orderBy(desc(t.evalRuns.ranAt));
    const latest = new Map<string, EvalRunRow>();
    for (const { run } of rows) {
      if (!latest.has(run.caseId)) latest.set(run.caseId, run);
    }
    return latest;
  }

  /** Per-case results of one suite run (with case names), oldest first. */
  async resultsForSuiteRun(suiteRunId: string): Promise<SuiteCaseResult[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name })
      .from(t.evalRuns)
      .leftJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(eq(t.evalRuns.suiteRunId, suiteRunId))
      .orderBy(asc(t.evalRuns.ranAt));
    return rows;
  }

  /** Raw per-case results (case id + fingerprint) for several suite runs. */
  async fingerprintsForSuiteRuns(
    suiteRunIds: string[],
  ): Promise<{ suiteRunId: string; caseId: string; fingerprint: string | null }[]> {
    if (suiteRunIds.length === 0) return [];
    const rows = await this.db
      .select({
        suiteRunId: t.evalRuns.suiteRunId,
        caseId: t.evalRuns.caseId,
        fingerprint: t.evalRuns.inputFingerprint,
      })
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.suiteRunId, suiteRunIds));
    return rows.map((r) => ({ suiteRunId: r.suiteRunId!, caseId: r.caseId, fingerprint: r.fingerprint }));
  }

  // ---- suite runs ---------------------------------------------------------

  async insertSuiteRun(values: {
    workspaceId: string;
    agentId: string;
    agentVersion: number;
    casesTotal: number;
  }): Promise<EvalSuiteRunRow> {
    const [row] = await this.db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId: values.workspaceId,
        agentId: values.agentId,
        agentVersion: values.agentVersion,
        status: 'running',
        casesTotal: values.casesTotal,
      })
      .returning();
    return row!;
  }

  async getSuiteRun(workspaceId: string, id: string): Promise<EvalSuiteRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, id)));
    return row;
  }

  async incrementCasesDone(id: string): Promise<void> {
    await this.db
      .update(t.evalSuiteRuns)
      .set({ casesDone: sql`${t.evalSuiteRuns.casesDone} + 1` })
      .where(eq(t.evalSuiteRuns.id, id));
  }

  async finishSuiteRun(id: string, v: FinishSuiteRun): Promise<void> {
    await this.db
      .update(t.evalSuiteRuns)
      .set({
        status: v.status,
        failureReason: v.failureReason ?? null,
        finishedAt: new Date(),
        recall: v.recall,
        precision: v.precision,
        citationAccuracy: v.citationAccuracy,
        passedCount: v.passedCount,
        evaluatedCount: v.evaluatedCount,
        erroredCount: v.erroredCount,
        durationMs: v.durationMs,
        costUsd: v.costUsd,
      })
      // Only a still-running row can finish (a boot reaper may have failed it).
      .where(and(eq(t.evalSuiteRuns.id, id), eq(t.evalSuiteRuns.status, 'running')));
  }

  /** The agent's `running` suite run, if any. */
  async runningSuiteRun(agentId: string): Promise<EvalSuiteRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.ownerKind, 'agent'),
          eq(t.evalSuiteRuns.agentId, agentId),
          eq(t.evalSuiteRuns.status, 'running'),
        ),
      );
    return row;
  }

  /** All running suite runs in the workspace, keyed by agent. */
  async runningSuiteRunsByAgent(workspaceId: string): Promise<Map<string, EvalSuiteRunRow>> {
    const rows = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, 'agent'),
          eq(t.evalSuiteRuns.status, 'running'),
        ),
      );
    return new Map(rows.map((r) => [r.agentId!, r]));
  }

  /** Boot reaper: every suite run still `running` belongs to a dead process. */
  async failRunningSuiteRuns(reason: string): Promise<number> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({ status: 'failed', failureReason: reason, finishedAt: new Date() })
      .where(eq(t.evalSuiteRuns.status, 'running'))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length;
  }

  /** An agent's suite runs started at/after `since` (all when null), newest first. */
  async listSuiteRuns(agentId: string, since: Date | null): Promise<EvalSuiteRunRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.ownerKind, 'agent'),
          eq(t.evalSuiteRuns.agentId, agentId),
          ...(since ? [gte(t.evalSuiteRuns.startedAt, since)] : []),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt));
  }

  /** An agent's most recent COMPLETED suite runs (newest first). */
  async latestCompletedSuiteRuns(workspaceId: string, agentId: string, limit: number): Promise<EvalSuiteRunRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, 'agent'),
          eq(t.evalSuiteRuns.agentId, agentId),
          eq(t.evalSuiteRuns.status, 'completed'),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(limit);
  }

  /** Completed suite runs across the workspace, newest first. */
  async completedSuiteRunsForWorkspace(workspaceId: string, limit: number): Promise<EvalSuiteRunRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, 'agent'),
          eq(t.evalSuiteRuns.status, 'completed'),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(limit);
  }

  /** Most recent suite runs (any status) across the workspace's agents. */
  async recentSuiteRunsForWorkspace(workspaceId: string, limit: number): Promise<SuiteRunWithAgent[]> {
    const rows = await this.db
      .select({ run: t.evalSuiteRuns, agentName: t.agents.name })
      .from(t.evalSuiteRuns)
      .innerJoin(t.agents, eq(t.agents.id, t.evalSuiteRuns.agentId))
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.ownerKind, 'agent')))
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(limit);
    return rows;
  }

  // ---- skill suite runs (SPEC-08) ------------------------------------------

  /** Insert a `running` skill run (suite when `skillVersion` is set, draft when null).
   *  A unique violation means another run of the skill is already running. */
  async insertSkillSuiteRun(values: SkillSuiteRunInput): Promise<EvalSuiteRunRow> {
    const [row] = await this.db.insert(t.evalSuiteRuns).values(skillRunValues(values)).returning();
    return row!;
  }

  /** Draft start in ONE transaction: drop the skill's previous (non-running) draft
   *  run - its per-case results cascade - then insert the new one (AC-16). A still
   *  `running` draft is kept, so the insert hits the one-running index (409). */
  async replaceSkillDraftRun(values: SkillSuiteRunInput): Promise<EvalSuiteRunRow> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.evalSuiteRuns)
        .where(
          and(
            eq(t.evalSuiteRuns.workspaceId, values.workspaceId),
            eq(t.evalSuiteRuns.skillId, values.skillId),
            eq(t.evalSuiteRuns.isDraft, true),
            sql`${t.evalSuiteRuns.status} <> 'running'`,
          ),
        );
      const [row] = await tx.insert(t.evalSuiteRuns).values(skillRunValues(values)).returning();
      return row!;
    });
  }

  /** True while the suite-run row exists (a skill delete cascades it away mid-run). */
  async suiteRunExists(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.evalSuiteRuns.id })
      .from(t.evalSuiteRuns)
      .where(eq(t.evalSuiteRuns.id, id));
    return row != null;
  }

  /** A skill's NON-draft runs started at/after `since` (all when null), newest first. */
  async listSkillSuiteRuns(workspaceId: string, skillId: string, since: Date | null): Promise<EvalSuiteRunRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, 'skill'),
          eq(t.evalSuiteRuns.skillId, skillId),
          eq(t.evalSuiteRuns.isDraft, false),
          ...(since ? [gte(t.evalSuiteRuns.startedAt, since)] : []),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt));
  }

  /** A skill's most recent COMPLETED non-draft runs (newest first). */
  async latestCompletedSkillSuiteRuns(
    workspaceId: string,
    skillId: string,
    limit: number,
  ): Promise<EvalSuiteRunRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, 'skill'),
          eq(t.evalSuiteRuns.skillId, skillId),
          eq(t.evalSuiteRuns.isDraft, false),
          eq(t.evalSuiteRuns.status, 'completed'),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(limit);
  }

  /** The skill's (single) draft run, any status. */
  async latestSkillDraftRun(workspaceId: string, skillId: string): Promise<EvalSuiteRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.skillId, skillId),
          eq(t.evalSuiteRuns.isDraft, true),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(1);
    return row;
  }

  /** Every `running` skill run (suite AND draft) in the workspace. */
  async runningSkillRuns(workspaceId: string): Promise<EvalSuiteRunRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, 'skill'),
          eq(t.evalSuiteRuns.status, 'running'),
        ),
      );
  }

  /** Completed non-draft skill runs across the workspace, newest first. */
  async completedSkillRunsForWorkspace(workspaceId: string, limit: number): Promise<EvalSuiteRunRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, 'skill'),
          eq(t.evalSuiteRuns.isDraft, false),
          eq(t.evalSuiteRuns.status, 'completed'),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(limit);
  }

  /** Most recent non-draft skill runs (any status) across the workspace's skills. */
  async recentSkillRunsForWorkspace(workspaceId: string, limit: number): Promise<SuiteRunWithSkill[]> {
    return this.db
      .select({ run: t.evalSuiteRuns, skillName: t.skills.name })
      .from(t.evalSuiteRuns)
      .innerJoin(t.skills, eq(t.skills.id, t.evalSuiteRuns.skillId))
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, 'skill'),
          eq(t.evalSuiteRuns.isDraft, false),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(limit);
  }
}

export interface SkillSuiteRunInput {
  workspaceId: string;
  skillId: string;
  /** Null for a draft run. */
  skillVersion: number | null;
  provider: string;
  model: string;
  casesTotal: number;
}

function skillRunValues(v: SkillSuiteRunInput) {
  return {
    workspaceId: v.workspaceId,
    ownerKind: 'skill' as const,
    skillId: v.skillId,
    skillVersion: v.skillVersion,
    isDraft: v.skillVersion == null,
    provider: v.provider,
    model: v.model,
    status: 'running' as const,
    casesTotal: v.casesTotal,
  };
}
