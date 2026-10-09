import { isAbsolute, posix, relative } from 'node:path';
import type { ProjectContextSourceFolder, SpecReadOutcome } from '@devdigest/shared';
import { ALLOWED_SOURCE_FOLDERS } from './constants.js';

/**
 * SPEC-04 (Project Context) — Ring 1 pure helpers. NO fs, NO Drizzle: every
 * function here is a plain decision over strings/numbers/arrays so it's
 * unit-testable with no DB/filesystem (onion-architecture). `repository.ts`
 * (Ring 2) is where the clone is actually walked/read/written; `service.ts`
 * feeds these functions the raw data it gets from ports.
 */

// ---------------------------------------------------------------------------
// Discovery / path validation (AC-1, AC-24, AC-25, AC-26)
// ---------------------------------------------------------------------------

export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

/** First allowlisted segment encountered walking the path from the root, or
 *  null when none matches. An overlapping path (`docs/specs/api.md`) is
 *  tagged with whichever segment comes FIRST — one document, one tag. */
export function sourceFolderFor(path: string): ProjectContextSourceFolder | null {
  const segments = path.split('/');
  for (const seg of segments) {
    if ((ALLOWED_SOURCE_FOLDERS as readonly string[]).includes(seg)) {
      return seg as ProjectContextSourceFolder;
    }
  }
  return null;
}

/** `.md` + an allowlisted segment at any depth (AC-1, AC-24). */
export function isAllowedDocumentPath(path: string): boolean {
  return isMarkdownPath(path) && sourceFolderFor(path) != null;
}

/** Narrow an arbitrary path list down to project-context documents — used by
 *  repo-intel's resync refusal (S-AC-28) to scope "locally modified" to
 *  `specs/`/`docs/`/`insights/` only, per that AC's edge case. */
export function filterAllowedPaths(paths: readonly string[]): string[] {
  return paths.filter(isAllowedDocumentPath);
}

/** De-duplicate a whole-ordered-set body (AC-9, AC-10), keeping each path's
 *  FIRST occurrence and dropping later repeats — defensive against a
 *  malformed/duplicated client payload. */
export function dedupePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

/**
 * Normalize + shape-validate a repo-relative path WITHOUT touching the
 * filesystem: rejects empty, absolute, backslash, NUL-byte, or `..`-escaping
 * input. Returns the posix-normalized relative path, or null when invalid.
 * The caller (repository.ts) still must confirm real clone-root containment
 * via `isWithinRoot` once it has resolved an absolute path (AC-25) — this
 * function alone cannot prove that on symlink-heavy filesystems.
 */
export function normalizeRelativePath(path: string): string | null {
  if (!path || path.trim().length === 0) return null;
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return null;
  const normalized = posix.normalize(path);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    posix.isAbsolute(normalized)
  ) {
    return null;
  }
  return normalized;
}

/** True when `candidateAbsPath` resolves to somewhere inside `rootAbsPath`
 *  (AC-25). Pure string/path comparison — both paths are already resolved by
 *  the caller; no fs access here. */
export function isWithinRoot(rootAbsPath: string, candidateAbsPath: string): boolean {
  const rel = relative(rootAbsPath, candidateAbsPath);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** Whitespace-only content is treated as empty (AC-17). */
export function isBlankContent(content: string): boolean {
  return content.trim().length === 0;
}

// ---------------------------------------------------------------------------
// Resolution order — dedup + skill inheritance (AC-12, AC-13, AC-14)
// ---------------------------------------------------------------------------

export interface OrderedDoc {
  path: string;
  order: number;
}

/** A skill's contribution to resolution: its own attached documents, plus
 *  whether it's currently reachable at all (linked + enabled + not
 *  scan-blocking — Open question 1's `enabled && !isScanBlocking(...)`
 *  filter, applied by the caller before building this input). */
export interface SkillContribution {
  /** The skill's order among the agent's linked skills. */
  skillOrder: number;
  /** False ⇒ every document below is excluded from the resolved set
   *  (disabled or scan-blocking skill; AC-14). */
  reachable: boolean;
  documents: OrderedDoc[];
}

/**
 * Resolve one agent's full attached-document PATH order: the agent's own set
 * first (its stored order), then each reachable skill's set (skill order,
 * then document order within the skill), deduped by path at the earliest
 * position (AC-12, AC-13, AC-14).
 */
export function resolveAttachedPaths(
  ownDocuments: OrderedDoc[],
  skillContributions: SkillContribution[],
): string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();

  const pushOrdered = (docs: OrderedDoc[]) => {
    for (const doc of [...docs].sort((a, b) => a.order - b.order)) {
      if (seen.has(doc.path)) continue;
      seen.add(doc.path);
      resolved.push(doc.path);
    }
  };

  pushOrdered(ownDocuments);

  for (const skill of [...skillContributions].sort((a, b) => a.skillOrder - b.skillOrder)) {
    if (!skill.reachable) continue;
    pushOrdered(skill.documents);
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Injection — content classification + budget drop (AC-15..AC-19)
// ---------------------------------------------------------------------------

export interface SpecsReadEntry {
  path: string;
  outcome: SpecReadOutcome;
}

export interface BuildSpecsReadResult {
  /** Full text of every injected document, in resolved order — feeds
   *  `PromptParts.specs` directly. */
  injectedTexts: string[];
  /** One entry per attached path, in resolved order (AC-19). */
  specsRead: SpecsReadEntry[];
}

/**
 * Classify every attached path into injected / missing / empty / dropped,
 * apply the whole-document token budget from the END of resolved order
 * (never a partial truncation — AC-18), and build the trace's `specs_read`.
 *
 * `contents` maps path → text, or `null` for a path that doesn't exist in
 * the clone (AC-16). `tokensFor` is injected so this stays pure (no
 * tokenizer I/O here).
 */
export function buildSpecsRead(
  orderedPaths: string[],
  contents: ReadonlyMap<string, string | null>,
  tokensFor: (text: string) => number,
  budget: number,
): BuildSpecsReadResult {
  const outcomeByPath = new Map<string, SpecReadOutcome>();
  const candidates: { path: string; text: string; tokens: number }[] = [];

  for (const path of orderedPaths) {
    const raw = contents.get(path);
    if (raw == null) {
      outcomeByPath.set(path, 'missing');
      continue;
    }
    if (isBlankContent(raw)) {
      outcomeByPath.set(path, 'empty');
      continue;
    }
    candidates.push({ path, text: raw, tokens: tokensFor(raw) });
  }

  // Budget drop from the END of resolved order — whole documents only.
  const kept = [...candidates];
  let total = kept.reduce((sum, c) => sum + c.tokens, 0);
  while (total > budget && kept.length > 0) {
    const last = kept.pop()!;
    outcomeByPath.set(last.path, 'dropped_for_budget');
    total -= last.tokens;
  }
  for (const k of kept) outcomeByPath.set(k.path, 'injected');

  const keptByPath = new Map(kept.map((k) => [k.path, k.text]));

  return {
    injectedTexts: orderedPaths.filter((p) => keptByPath.has(p)).map((p) => keptByPath.get(p)!),
    specsRead: orderedPaths.map((path) => ({ path, outcome: outcomeByPath.get(path)! })),
  };
}

// ---------------------------------------------------------------------------
// Coverage + used-by metrics (AC-21, AC-22)
// ---------------------------------------------------------------------------

export interface AgentUsageInput {
  agentId: string;
  /** This agent's own attached paths. */
  ownPaths: readonly string[];
  /** Paths reachable via this agent's attached, enabled, non-scan-blocking
   *  skills (already filtered by the caller — same trust filter as
   *  resolution, Open question 1). */
  inheritedPaths: readonly string[];
}

export interface SkillUsageInput {
  skillId: string;
  /** This (enabled, in-population) skill's own attached paths. */
  paths: readonly string[];
}

export interface CoverageResult {
  /** null = not applicable (zero enabled agents/skills in the workspace) —
   *  never 0 (AC-21 edge case). */
  coveragePct: number | null;
  usedByAgents: number;
}

/**
 * One document's coverage % (of enabled agents+skills that reach it) and
 * used-by-agents count (AC-21, AC-22). `agents`/`skills` are already scoped
 * to "enabled" by the caller — this function only does the pure math.
 */
export function computeCoverage(
  path: string,
  agents: readonly AgentUsageInput[],
  skills: readonly SkillUsageInput[],
): CoverageResult {
  const denominator = agents.length + skills.length;
  if (denominator === 0) return { coveragePct: null, usedByAgents: 0 };

  let numerator = 0;
  let usedByAgents = 0;
  for (const agent of agents) {
    if (agent.ownPaths.includes(path) || agent.inheritedPaths.includes(path)) {
      numerator += 1;
      usedByAgents += 1;
    }
  }
  for (const skill of skills) {
    if (skill.paths.includes(path)) numerator += 1;
  }

  return { coveragePct: Math.round((numerator / denominator) * 100), usedByAgents };
}
