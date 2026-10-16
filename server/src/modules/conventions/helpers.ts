import type { ConventionCandidate } from '@devdigest/shared';
import type { ConventionRow, ConventionWithSkill } from './repository.js';

/**
 * Pure helpers for the conventions module — DB row ⇄ DTO mapping and the
 * evidence-verification predicate. No I/O.
 */

/** Map a persisted convention row to the public `ConventionCandidate` DTO. */
export function toConventionDto(row: ConventionWithSkill): ConventionCandidate {
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
    skill: row.skill ? { id: row.skill.id, name: row.skill.name, repo_id: row.skill.repoId } : null,
  };
}

/**
 * Which of the requested ids can NOT go into a new skill
 * (SPEC-2026-10-16-convention-skills AC-4/AC-5). `missing`: not found in the
 * workspace, or belongs to another repo (reported as not found, so a caller
 * can't probe other repos). `unavailable`: found but not accepted, or already
 * linked to a skill. Used both for the unlocked pre-check and the re-check
 * under `FOR UPDATE`.
 */
export function unavailableIds(
  rows: Pick<ConventionRow, 'id' | 'repoId' | 'status' | 'skillId'>[],
  ids: string[],
  repoId: string,
): { missing: string[]; unavailable: string[] } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const missing: string[] = [];
  const unavailable: string[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.repoId !== repoId) missing.push(id);
    else if (row.status !== 'accepted' || row.skillId !== null) unavailable.push(id);
  }
  return { missing, unavailable };
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
