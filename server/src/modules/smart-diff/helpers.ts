import type { SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { CLASSIFICATION_RULES, ROLE_ORDER } from './constants.js';

/**
 * Pure helpers for the smart-diff module — no I/O. Classification and group
 * assembly are unit-tested directly (`smart-diff-helpers.test.ts`) since the
 * classifier table itself is the spec of correctness for this feature.
 */

/** Minimal shape `classifyFile`/`buildGroups` need from a `pr_files` row —
 *  kept narrow so callers (and tests) don't need a full Drizzle row. */
export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

/**
 * Classify one repo-relative file path into a `SmartDiffRole`, first-match-wins
 * against `CLASSIFICATION_RULES` (in group order — see that file's doc comment
 * for the deliberate precedence between overlapping rules). Falls back to
 * `'core'` when nothing matches. Normalizes `\` → `/` so it behaves the same
 * whether the path came from a Windows or POSIX checkout.
 */
export function classifyFile(path: string): SmartDiffRole {
  const normalized = path.replace(/\\/g, '/');
  for (const { role, patterns } of CLASSIFICATION_RULES) {
    if (patterns.some((re) => re.test(normalized))) return role;
  }
  return 'core';
}

/** Map one `pr_files` row (+ its finding line numbers) to the transport DTO. */
export function toSmartDiffFile(file: SmartDiffInputFile, findingLines: number[]): SmartDiffFile {
  return {
    path: file.path,
    pseudocode_summary: null,
    additions: file.additions,
    deletions: file.deletions,
    finding_lines: findingLines,
  };
}

/**
 * Classify + group every changed file into `ROLE_ORDER` buckets — ALL 5
 * groups are emitted, even ones with no files, so the client can render a
 * stable set of role headers regardless of what a given PR touches.
 */
export function buildGroups(
  files: SmartDiffInputFile[],
  findingLinesByPath: Map<string, number[]>,
): SmartDiffGroup[] {
  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>(ROLE_ORDER.map((role) => [role, []]));
  for (const file of files) {
    const role = classifyFile(file.path);
    const dto = toSmartDiffFile(file, findingLinesByPath.get(file.path) ?? []);
    byRole.get(role)!.push(dto);
  }
  return ROLE_ORDER.map((role) => ({ role, files: byRole.get(role) ?? [] }));
}

/** Minimal shape `buildFindingLinesByPath` needs from a finding row. */
export interface SmartDiffInputFinding {
  file: string;
  startLine: number;
}

/**
 * Every finding's `start_line`, deduped + sorted, keyed by file path — pooled
 * across ALL reviews for the PR (not just the latest run), since the Files-
 * changed tab shows the dot indicator / inline finding cards for anything
 * still live regardless of which agent run produced it.
 */
export function buildFindingLinesByPath(findings: SmartDiffInputFinding[]): Map<string, number[]> {
  const byPath = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = byPath.get(f.file) ?? new Set<number>();
    set.add(f.startLine);
    byPath.set(f.file, set);
  }
  const out = new Map<string, number[]>();
  for (const [path, lines] of byPath) out.set(path, Array.from(lines).sort((a, b) => a - b));
  return out;
}
