import { z } from 'zod';
import { Severity } from '@devdigest/shared';
import type { EvalCase, EvalCaseListItem, EvalCaseRun } from '@devdigest/shared';
import type { EvalExpectedFinding } from '@devdigest/reviewer-core';
import type { EvalCaseRow, EvalRunRow } from '../../db/rows.js';

/**
 * Pure helpers for the eval module — DB row ⇄ DTO mapping, expected-output
 * parsing, and the aggregation math for the Evals tab's rollup and the
 * dashboard's summary. No I/O.
 */

export function toEvalCaseDto(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind as EvalCase['owner_kind'],
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles,
    input_meta: row.inputMeta,
    expected_output: row.expectedOutput,
    notes: row.notes,
  };
}

export function toEvalCaseRunDto(row: EvalRunRow): EvalCaseRun {
  return {
    id: row.id,
    case_id: row.caseId,
    ran_at: row.ranAt.toISOString(),
    actual_output: row.actualOutput,
    pass: row.pass,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
  };
}

export function toEvalCaseListItem(caseRow: EvalCaseRow, lastRun: EvalRunRow | undefined): EvalCaseListItem {
  return { ...toEvalCaseDto(caseRow), last_run: lastRun ? toEvalCaseRunDto(lastRun) : null };
}

/** `expected_output` is untyped jsonb — validate it into the shape
 *  `scoreEvalCase` expects. Malformed/missing data degrades to an empty
 *  expected list (recall becomes trivially 1, precision reflects whatever
 *  the model found) rather than failing the run — an eval case with bad
 *  data shouldn't crash the "Run eval (N)" batch for every OTHER case. */
const ExpectedFindingSchema = z.object({
  severity: Severity,
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int().optional(),
  category: z.string().optional(),
  title: z.string().optional(),
});

export function parseExpectedOutput(expectedOutput: unknown): EvalExpectedFinding[] {
  const result = z.array(ExpectedFindingSchema).safeParse(expectedOutput);
  return result.success ? result.data : [];
}

/** Average of the non-null values, or null when there are none. */
function avgOf(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null);
  if (known.length === 0) return null;
  return known.reduce((a, b) => a + b, 0) / known.length;
}

/** The Evals tab's header rollup: average recall/precision/citation over
 *  each case's LATEST run, excluding cases that have never run. */
export function aggregateLatestRuns(latestRuns: (EvalRunRow | undefined)[]): {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  cases_evaluated: number;
} {
  const runs = latestRuns.filter((r): r is EvalRunRow => r != null);
  return {
    recall: avgOf(runs.map((r) => r.recall)),
    precision: avgOf(runs.map((r) => r.precision)),
    citation_accuracy: avgOf(runs.map((r) => r.citationAccuracy)),
    cases_evaluated: runs.length,
  };
}
