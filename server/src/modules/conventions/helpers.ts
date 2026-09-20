import type { ConventionCandidate } from '@devdigest/shared';
import type { ConventionRow } from './repository.js';

/**
 * Pure helpers for the conventions module — DB row ⇄ DTO mapping and the
 * evidence-verification predicate. No I/O.
 */

/** Map a persisted convention row to the public `ConventionCandidate` DTO. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    rationale: row.rationale,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_line: row.evidenceLine,
    confidence: row.confidence ?? 0,
    status: row.status,
  };
}

/** Collapse runs of whitespace so formatting differences (indentation,
 *  trailing spaces) don't defeat the substring check below. */
export function normalizeForMatch(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * The code-level evidence check: does `snippet` actually appear in `source`?
 * A candidate that fails this (hallucinated file content, wrong line) is
 * discarded before it ever reaches the DB or the reviewer — see
 * `ConventionsService.extract`.
 */
export function evidenceExistsInSource(source: string, snippet: string): boolean {
  const needle = normalizeForMatch(snippet);
  if (!needle) return false;
  return normalizeForMatch(source).includes(needle);
}

/** Keep a model-reported line number only when it's actually within the
 *  sampled file — an out-of-range line is dropped (set to null) rather than
 *  rejecting an otherwise-verified candidate outright. */
export function clampEvidenceLine(source: string, line: number | null | undefined): number | null {
  if (line == null) return null;
  const totalLines = source.split('\n').length;
  return line >= 1 && line <= totalLines ? line : null;
}
