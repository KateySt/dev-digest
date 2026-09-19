import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalCaseRow, EvalRunRow } from '../../db/rows.js';

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: 'skill' | 'agent';
  ownerId: string;
  name: string;
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
  actualOutput: unknown;
  pass: boolean;
  recall: number;
  precision: number;
  citationAccuracy: number;
  durationMs: number;
  costUsd: number | null;
}

/** A recent run joined with its case's name/owner — the Eval Dashboard's
 *  "recent runs" table and trend chart. */
export interface RecentEvalRun {
  run: EvalRunRow;
  caseName: string;
}

/**
 * A1-adjacent — eval data-access. Owns `eval_cases` + `eval_runs`.
 * `eval_runs` has no `workspaceId` of its own — every workspace-scoped query
 * over it joins through `eval_cases`.
 */
export class EvalRepository {
  constructor(private db: Db) {}

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
      );
  }

  async allCasesForWorkspace(workspaceId: string): Promise<EvalCaseRow[]> {
    return this.db.select().from(t.evalCases).where(eq(t.evalCases.workspaceId, workspaceId));
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        name: values.name,
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

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  async insertRun(values: InsertEvalRun): Promise<EvalRunRow> {
    const [row] = await this.db
      .insert(t.evalRuns)
      .values({
        caseId: values.caseId,
        actualOutput: values.actualOutput as object,
        pass: values.pass,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
      })
      .returning();
    return row!;
  }

  /** Most recent run per case, batched (avoids N+1 for the case list). Cases
   *  with no runs simply have no entry in the returned map. */
  async latestRunsForCases(caseIds: string[]): Promise<Map<string, EvalRunRow>> {
    if (caseIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.caseId, caseIds))
      .orderBy(desc(t.evalRuns.ranAt));
    const latest = new Map<string, EvalRunRow>();
    for (const row of rows) {
      if (!latest.has(row.caseId)) latest.set(row.caseId, row);
    }
    return latest;
  }

  /** Recent runs across the whole workspace, newest first — the Eval
   *  Dashboard's trend + recent-runs table. Joined through `eval_cases`
   *  since `eval_runs` has no `workspaceId` of its own. */
  async recentRunsForWorkspace(workspaceId: string, limit: number): Promise<RecentEvalRun[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(eq(t.evalCases.workspaceId, workspaceId))
      .orderBy(desc(t.evalRuns.ranAt))
      .limit(limit);
    return rows;
  }

  /** Total eval_runs ever recorded for the workspace (unbounded — for the
   *  dashboard's summary count, separate from the limited "recent" list). */
  async countRunsForWorkspace(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(eq(t.evalCases.workspaceId, workspaceId));
    return row?.n ?? 0;
  }
}
