import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  AgentEvalStats,
  EvalCase,
  EvalCaseListItem,
  EvalCaseRun,
  EvalMetricName,
  EvalRange,
  EvalRegressionAlert,
  EvalSuiteRun,
  SkillEvalSuiteRun,
} from '@devdigest/shared';
import { aggregateSuiteScores } from '@devdigest/reviewer-core';
import type { EvalCaseKind, EvalLocation, EvalSuiteCaseInput } from '@devdigest/reviewer-core';
import type { EvalCaseRow, EvalRunRow, EvalSuiteRunRow } from '../../db/rows.js';
import {
  FALLBACK_CASE_NAME,
  FULL_FILE_END_LINE,
  RANGE_DAYS,
  REGRESSION_THRESHOLD_POINTS,
} from './constants.js';

/**
 * Pure helpers for the eval module — DB row <-> DTO mapping, expected-output
 * parsing, hunk freezing, fingerprints, and the deterministic history math
 * (regression alert, compare flags). No I/O.
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
    kind: row.kind as EvalCase['kind'],
    source: row.source as EvalCase['source'],
    source_finding_id: row.sourceFindingId,
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
    suite_run_id: row.suiteRunId,
    status: row.status as EvalCaseRun['status'],
    error: row.error,
  };
}

export function toEvalCaseListItem(caseRow: EvalCaseRow, lastRun: EvalRunRow | undefined): EvalCaseListItem {
  return { ...toEvalCaseDto(caseRow), last_run: lastRun ? toEvalCaseRunDto(lastRun) : null };
}

/** Status / progress / pooled-metric fields common to agent and skill suite-run DTOs. */
function suiteRunBase(row: EvalSuiteRunRow) {
  return {
    id: row.id,
    status: row.status as EvalSuiteRun['status'],
    failure_reason: row.failureReason,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    cases_total: row.casesTotal,
    cases_done: row.casesDone,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    passed_count: row.passedCount,
    evaluated_count: row.evaluatedCount,
    errored_count: row.erroredCount,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
  };
}

/** Agent suite run (`agent_id` / `agent_version` are non-null on agent-owned rows — DB CHECK). */
export function toEvalSuiteRunDto(row: EvalSuiteRunRow): EvalSuiteRun {
  return { ...suiteRunBase(row), owner_kind: 'agent', agent_id: row.agentId!, agent_version: row.agentVersion! };
}

/** Skill suite run or draft run (`skill_version` null for drafts). */
export function toSkillSuiteRunDto(row: EvalSuiteRunRow): SkillEvalSuiteRun {
  return {
    ...suiteRunBase(row),
    owner_kind: 'skill',
    skill_id: row.skillId!,
    skill_version: row.skillVersion,
    is_draft: row.isDraft,
    provider: row.provider,
    model: row.model,
  };
}

// ---------------------------------------------------------------------------
// expected_output / forbidden locations
// ---------------------------------------------------------------------------

/** One entry of `expected_output`: an expected finding (must_find) or a
 *  forbidden location (must_not_flag). Only file + lines are matched. */
const LocationSchema = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int().optional(),
});

/**
 * `expected_output` is untyped jsonb — validate it with Zod before scoring.
 * Malformed/missing data degrades to an empty list rather than failing the
 * run (SPEC-02 edge case): one bad manual case must not sink a whole suite.
 */
export function parseLocations(expectedOutput: unknown): EvalLocation[] {
  const result = z.array(LocationSchema).safeParse(expectedOutput);
  return result.success ? result.data : [];
}

/** Narrow the stored kind string (column is constrained, this is defensive). */
export function asCaseKind(kind: string): EvalCaseKind {
  return kind === 'must_not_flag' ? 'must_not_flag' : 'must_find';
}

// ---------------------------------------------------------------------------
// case-from-finding helpers
// ---------------------------------------------------------------------------

/** kebab-case form of a finding title (default case name). */
export function kebabName(title: string): string {
  const kebab = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return kebab || FALLBACK_CASE_NAME;
}

/** Findings with no meaningful line range are treated as whole-file: the
 *  full-file kinds (secret_leak / hook) or a non-positive start line. */
export function isFullFileFinding(f: { kind: string | null; startLine: number }): boolean {
  return f.kind === 'secret_leak' || f.kind === 'hook' || f.startLine <= 0;
}

/** The location a finding contributes to a case (whole file when no range). */
export function findingLocation(f: {
  file: string;
  kind: string | null;
  startLine: number;
  endLine: number;
}): Required<EvalLocation> {
  if (isFullFileFinding(f)) return { file: f.file, start_line: 1, end_line: FULL_FILE_END_LINE };
  return { file: f.file, start_line: f.startLine, end_line: Math.max(f.startLine, f.endLine) };
}

/** Split a raw unified diff into per-file sections (each begins at `diff --git`). */
function splitFileSections(raw: string): string[] {
  const lines = raw.split('\n');
  const sections: string[][] = [];
  for (const line of lines) {
    if (line.startsWith('diff --git')) sections.push([line]);
    else if (sections.length > 0) sections[sections.length - 1]!.push(line);
  }
  return sections.map((s) => s.join('\n'));
}

function sectionPath(section: string): string | undefined {
  const plus = section.split('\n').find((l) => l.startsWith('+++ '));
  if (plus) {
    const p = plus.slice(4).replace(/^b\//, '').trim();
    if (p !== '/dev/null') return p;
  }
  const head = section.split('\n')[0]!.match(/^diff --git a\/(.+?) b\/(.+)$/);
  return head?.[2];
}

/**
 * Freeze the part of a unified diff a case needs: ONLY the hunks of `file`
 * whose new-side range overlaps `range`, re-serialised as unified text. A
 * `null` range (full-file finding) keeps all of the file's hunks. Returns ''
 * when the file isn't in the diff.
 */
export function freezeFileHunks(
  rawDiff: string,
  file: string,
  range: { start: number; end: number } | null,
): string {
  for (const section of splitFileSections(rawDiff)) {
    if (sectionPath(section) !== file) continue;
    const lines = section.split('\n');
    const hunks: string[][] = [];
    for (const line of lines) {
      if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(line)) hunks.push([line]);
      else if (hunks.length > 0) hunks[hunks.length - 1]!.push(line);
    }
    const kept = hunks.filter((h) => {
      if (range === null) return true;
      const m = h[0]!.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)!;
      const start = Number(m[1]);
      const len = m[2] !== undefined ? Number(m[2]) : 1;
      const end = start + Math.max(len, 1) - 1;
      return start <= range.end && range.start <= end;
    });
    if (kept.length === 0) return '';
    const body = kept.map((h) => h.join('\n').replace(/\n+$/, '')).join('\n');
    return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n${body}\n`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// fingerprint
// ---------------------------------------------------------------------------

/** JSON with object keys sorted, so equal data hashes equally. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

/** sha256 of the case inputs a run depends on (diff, PR meta, expected / forbidden, kind). */
export function inputFingerprint(c: {
  inputDiff: string | null;
  inputMeta: unknown;
  expectedOutput: unknown;
  kind: string;
}): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        diff: c.inputDiff ?? '',
        meta: c.inputMeta ?? null,
        expected: c.expectedOutput ?? null,
        kind: c.kind,
      }),
    )
    .digest('hex');
}

// ---------------------------------------------------------------------------
// history math
// ---------------------------------------------------------------------------

const METRICS: EvalMetricName[] = ['recall', 'precision', 'citation_accuracy'];
const METRIC_LABEL: Record<EvalMetricName, string> = {
  recall: 'Recall',
  precision: 'Precision',
  citation_accuracy: 'Citation accuracy',
};

/** Percentage-point difference (rounded to 0.01 pt to dodge float noise), or null. */
export function pointDelta(newer: number | null, older: number | null): number | null {
  if (newer == null || older == null) return null;
  return Math.round((newer - older) * 10000) / 100;
}

/**
 * Regression alert for the latest COMPLETED run vs. the previous COMPLETED
 * run: any metric at least 1 point lower raises it. Built from a fixed
 * template — no model call. Returns null when nothing dropped enough.
 */
export function buildRegressionAlert(
  latest: EvalSuiteRun | SkillEvalSuiteRun | undefined,
  previous: EvalSuiteRun | SkillEvalSuiteRun | undefined,
): EvalRegressionAlert | null {
  if (!latest || !previous) return null;
  const latestVersion = runVersion(latest);
  const previousVersion = runVersion(previous);
  const modelChanged = runModelChanged(latest, previous);
  const drops: EvalRegressionAlert['drops'] = [];
  const others: EvalRegressionAlert['others'] = [];
  for (const metric of METRICS) {
    const delta = pointDelta(latest[metric], previous[metric]);
    if (delta == null) continue;
    if (-delta >= REGRESSION_THRESHOLD_POINTS) drops.push({ metric, points: -delta });
    else others.push({ metric, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' });
  }
  if (drops.length === 0) return null;

  const dropText = drops
    .map((d) => `${METRIC_LABEL[d.metric]} dropped ${formatPoints(d.points)} points`)
    .join(', ');
  const othersText = others.map((o) => `${METRIC_LABEL[o.metric]} ${o.direction === 'flat' ? 'unchanged' : o.direction === 'up' ? 'rose' : 'slipped'}`).join(', ');
  const message =
    `${dropText} in v${latestVersion} vs v${previousVersion}.` +
    (othersText ? ` ${othersText}.` : '') +
    (modelChanged ? ' (model changed between runs)' : '');
  return {
    version: latestVersion,
    previous_version: previousVersion,
    drops,
    others,
    message,
    // Agent alerts stay byte-identical: the flag is only emitted for skill runs.
    ...('skill_id' in latest ? { model_changed: modelChanged } : {}),
  };
}

type VersionedRun = EvalSuiteRun | SkillEvalSuiteRun;

/** The agent or skill version a run executed (a skill draft has none — never reaches here). */
export function runVersion(run: VersionedRun): number {
  return 'skill_id' in run ? (run.skill_version ?? 0) : run.agent_version;
}

/** True when two skill runs used a different provider or model (agent runs: always false). */
export function runModelChanged(a: VersionedRun, b: VersionedRun): boolean {
  if (!('skill_id' in a) || !('skill_id' in b)) return false;
  return a.provider !== b.provider || a.model !== b.model;
}

/** Compare ordering: lower skill version = old; equal versions fall back to start time. */
export function orderRunsForCompare<R extends { skillVersion: number | null; startedAt: Date }>(
  a: R,
  b: R,
): [older: R, newer: R] {
  const av = a.skillVersion ?? 0;
  const bv = b.skillVersion ?? 0;
  if (av !== bv) return av < bv ? [a, b] : [b, a];
  return a.startedAt <= b.startedAt ? [a, b] : [b, a];
}

export interface SuiteRunSummary {
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  passedCount: number;
  evaluatedCount: number;
  erroredCount: number;
  status: 'completed' | 'failed';
  failureReason: string | null;
  costUsd: number | null;
}

/** Final summary of a run from its per-case outcomes: pooled metrics (SPEC-02 AC-33..36),
 *  counts, and summed cost (null when any finished case's cost is unknown). */
export function summarizeSuiteRun(
  scored: (EvalSuiteCaseInput & { costUsd: number | null })[],
  erroredCount: number,
): SuiteRunSummary {
  const pooled = aggregateSuiteScores(scored);
  const completed = pooled.evaluated >= 1;
  const cost = scored.reduce<number | null>(
    (acc, c) => (acc == null || c.costUsd == null ? null : acc + c.costUsd),
    0,
  );
  return {
    recall: pooled.recall,
    precision: pooled.precision,
    citationAccuracy: pooled.citationAccuracy,
    passedCount: pooled.passed,
    evaluatedCount: pooled.evaluated,
    erroredCount,
    status: completed ? 'completed' : 'failed',
    failureReason: completed ? null : 'every case errored',
    costUsd: completed ? cost : null,
  };
}

function formatPoints(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(1);
}

/** Deltas (fractions, new minus old) for the three metrics; null when either side is null. */
export function metricDeltas(
  newer: EvalSuiteRun | SkillEvalSuiteRun | undefined,
  older: EvalSuiteRun | SkillEvalSuiteRun | undefined,
): AgentEvalStats['delta'] {
  const d = (a: number | null | undefined, b: number | null | undefined) =>
    a == null || b == null ? null : Math.round((a - b) * 1e6) / 1e6;
  return {
    recall: d(newer?.recall, older?.recall),
    precision: d(newer?.precision, older?.precision),
    citation_accuracy: d(newer?.citation_accuracy, older?.citation_accuracy),
  };
}

export interface CompareResultRow {
  caseId: string;
  fingerprint: string | null;
}

/**
 * Compare flags for two suite runs' per-case results: whether the executed
 * case-id sets differ (with both counts) and how many cases present in both
 * runs have a different input fingerprint (edited between runs).
 */
export function compareCaseFlags(
  oldResults: CompareResultRow[],
  newResults: CompareResultRow[],
): { case_sets_differ: { old_count: number; new_count: number } | null; edited_cases: number } {
  const oldIds = new Set(oldResults.map((r) => r.caseId));
  const newIds = new Set(newResults.map((r) => r.caseId));
  const differ = oldIds.size !== newIds.size || [...oldIds].some((id) => !newIds.has(id));

  const oldPrints = new Map(oldResults.map((r) => [r.caseId, r.fingerprint] as const));
  let edited = 0;
  for (const r of newResults) {
    const before = oldPrints.get(r.caseId);
    if (before != null && r.fingerprint != null && before !== r.fingerprint) edited++;
  }
  return {
    case_sets_differ: differ ? { old_count: oldIds.size, new_count: newIds.size } : null,
    edited_cases: edited,
  };
}

/** Start of the look-back window for a range, or null for `all`. */
export function rangeStart(range: EvalRange, now: Date): Date | null {
  if (range === 'all') return null;
  return new Date(now.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
}

/** postgres-js / drizzle unique-violation detection (SQLSTATE 23505, possibly wrapped). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** Pick which decision a finding carries (accept and dismiss are mutually exclusive). */
export function findingDecision(f: {
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}): 'accepted' | 'dismissed' | null {
  if (f.acceptedAt && !f.dismissedAt) return 'accepted';
  if (f.dismissedAt && !f.acceptedAt) return 'dismissed';
  if (f.acceptedAt && f.dismissedAt) return f.acceptedAt >= f.dismissedAt ? 'accepted' : 'dismissed';
  return null;
}

/** postgres-js / drizzle foreign-key violation detection (SQLSTATE 23503, possibly wrapped). */
export function isForeignKeyViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23503' || e?.cause?.code === '23503';
}
