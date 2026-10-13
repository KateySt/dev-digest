import { MEMORY_CONTENT_MAX } from '@devdigest/shared';
import type {
  Memory,
  MemoryDraft,
  MemoryInput,
  MemoryKind,
  MemoryLink,
  MemoryScope,
  MemorySource,
  StaleReason,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import type { MemoryRow } from './repository.js';
import { MEMORY_STALE_DAYS } from './constants.js';

/**
 * Pure helpers for the memory module: cross-field validation (AC-11/AC-12),
 * glob syntax check, staleness, and row → DTO mapping.
 */

const DAY_MS = 86_400_000;

/** Glob syntax we support (see reviewer-core `matchesAnyGlob`): `**`, `*`, `?`,
 *  literal characters. Character classes / braces / absolute or parent paths
 *  are rejected so a user is never surprised by a glob that silently never matches. */
export function isValidGlob(g: string): boolean {
  if (g.length === 0 || g.length > 200) return false;
  if (/[[\]{}\\]/.test(g)) return false;
  if (g.startsWith('/')) return false;
  if (g.split('/').some((seg) => seg === '..')) return false;
  return true;
}

export interface ValidationContext {
  /** Every linked skill id → its repo id (null = global skill). */
  skillRepoIds: Map<string, string | null>;
}

/** Cross-field rules the zod schema can't express. Throws ValidationError (422). */
export function validateMemoryInput(input: MemoryInput, ctx: ValidationContext): void {
  if (input.scope === 'repo' && !input.repo_id) {
    throw new ValidationError('A repo-scoped memory needs a repo_id');
  }
  if (input.scope === 'global' && input.repo_id) {
    throw new ValidationError('A global memory must not carry a repo_id');
  }
  if (input.links.length === 0 && !input.applies_to_all_agents) {
    throw new ValidationError('Link the memory to at least one agent or skill, or apply it to all agents');
  }
  const bad = input.path_globs.find((g) => !isValidGlob(g));
  if (bad !== undefined) {
    throw new ValidationError(`Invalid path glob: "${bad}"`);
  }
  if (input.scope === 'repo') {
    for (const link of input.links) {
      if (link.target_kind !== 'skill') continue;
      const skillRepo = ctx.skillRepoIds.get(link.target_id);
      if (skillRepo && skillRepo !== input.repo_id) {
        throw new ValidationError('A repo memory cannot be linked to a skill scoped to a different repo');
      }
    }
  }
}

export interface StaleClockRow {
  lastUsedAt: Date | null;
  createdAt: Date;
  /** Curation "Keep" (SPEC-2026-10-12-memory-curation) resets the clock. */
  keptAt?: Date | null;
}

/** When the memory last showed it is alive: last use (or creation), or a later Keep. */
export function staleClock(row: StaleClockRow): Date {
  const ref = row.lastUsedAt ?? row.createdAt;
  return row.keptAt && row.keptAt > ref ? row.keptAt : ref;
}

export function isStale(row: StaleClockRow, now: Date): boolean {
  return now.getTime() - staleClock(row).getTime() > MEMORY_STALE_DAYS * DAY_MS;
}

export interface LinkWithName extends MemoryLink {
  name: string;
}

export function memoryRowToDto(row: MemoryRow, links: LinkWithName[], now: Date): Memory {
  return {
    id: row.id,
    content: row.content,
    kind: row.kind as MemoryKind,
    scope: row.scope as MemoryScope,
    repo_id: row.repoId,
    confidence: row.confidence ?? 0,
    sources: (row.sources as MemorySource[] | null) ?? [],
    path_globs: row.pathGlobs,
    links,
    applies_to_all_agents: row.appliesToAllAgents,
    unlinked: links.length === 0 && !row.appliesToAllAgents,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    last_used_at: row.lastUsedAt?.toISOString() ?? null,
    archived_at: row.archivedAt?.toISOString() ?? null,
    stale: isStale(row, now),
    merged_into: row.mergedInto,
    kept_at: row.keptAt?.toISOString() ?? null,
  };
}

/** PR numbers a memory was learned from (trace `source_prs`, card chips). */
export function sourcePrs(sources: MemorySource[]): number[] {
  return [...new Set(sources.map((s) => s.pr).filter((p): p is number => typeof p === 'number'))];
}

// ---- Learn draft (AC-3..AC-5) ----------------------------------------------

/** Default kind: a dismissed finding is a "don't flag this" learning; anything
 *  else is a fact agents should check for (the LLM may override). */
export function defaultDraftKind(f: { acceptedAt: Date | null; dismissedAt: Date | null }): 'learning' | 'fact' {
  return f.dismissedAt ? 'learning' : 'fact';
}

export interface DraftFinding {
  title: string;
  rationale: string;
  repoId: string;
  agentId: string | null;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

/** Scope/links defaults shared by the LLM draft and the fallback (AC-4). */
export function draftDefaults(f: DraftFinding, opts: { agentExists: boolean }) {
  const linkAgent = opts.agentExists && f.agentId;
  return {
    scope: 'repo' as const,
    repo_id: f.repoId,
    links: linkAgent ? [{ target_kind: 'agent' as const, target_id: f.agentId! }] : [],
    applies_to_all_agents: !linkAgent,
  };
}

/** Deterministic draft used when the LLM call fails or times out (AC-5). */
export function fallbackDraft(f: DraftFinding, opts: { agentExists: boolean }): MemoryDraft {
  return {
    content: `${f.title}: ${f.rationale}`.slice(0, MEMORY_CONTENT_MAX).trim(),
    kind: defaultDraftKind(f),
    path_globs: [],
    confidence: 0.5,
    ...draftDefaults(f, opts),
    fallback: true,
  };
}

// ---- Curation (SPEC-2026-10-12-memory-curation) ----------------------------

/** One "similar" relation between two memories (unordered). */
export interface SimilarPair {
  a: string;
  b: string;
  score: number;
}

/** What the pure curation logic needs about a memory. */
export interface CurationCandidate extends StaleClockRow {
  id: string;
  confidence: number | null;
  sources: unknown;
  appliesToAllAgents: boolean;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** Every pair of vectors with cosine ≥ `min` (O(n²); fine at ~1,000 memories). */
export function embeddingPairs(rows: { id: string; vec: number[] }[], min: number): SimilarPair[] {
  const out: SimilarPair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const score = cosine(rows[i]!.vec, rows[j]!.vec);
      if (score >= min) out.push({ a: rows[i]!.id, b: rows[j]!.id, score });
    }
  }
  return out;
}

/** Connected components (size ≥ 2) of the "similar" graph — union-find. */
export function groupPairs(ids: string[], pairs: SimilarPair[]): string[][] {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const p of pairs) {
    if (!parent.has(p.a) || !parent.has(p.b)) continue;
    parent.set(find(p.a), find(p.b));
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);
  return [...groups.values()].filter((g) => g.length >= 2);
}

const sourceCount = (s: unknown) => (Array.isArray(s) ? s.length : 0);

/** Suggested primary: confidence, then most sources, then most recently used, then oldest. */
export function pickPrimary(members: CurationCandidate[]): string {
  const sorted = [...members].sort(
    (x, y) =>
      (y.confidence ?? 0) - (x.confidence ?? 0) ||
      sourceCount(y.sources) - sourceCount(x.sources) ||
      (y.lastUsedAt?.getTime() ?? -Infinity) - (x.lastUsedAt?.getTime() ?? -Infinity) ||
      x.createdAt.getTime() - y.createdAt.getTime(),
  );
  return sorted[0]!.id;
}

/** Primary + the `max - 1` members most similar to it (missing direct pair = 0). */
export function trimGroup(memberIds: string[], primaryId: string, pairs: SimilarPair[], max: number): string[] {
  const toPrimary = (id: string) =>
    pairs.find((p) => (p.a === primaryId && p.b === id) || (p.b === primaryId && p.a === id))?.score ?? 0;
  const rest = memberIds
    .filter((id) => id !== primaryId)
    .map((id) => ({ id, score: toPrimary(id) }))
    .sort((x, y) => y.score - x.score);
  return [primaryId, ...rest.slice(0, max - 1).map((r) => r.id)];
}

/** Why a memory is a retirement candidate. Keep never hides `unlinked`. */
export function staleReasons(row: CurationCandidate & { linkCount: number }, now: Date): StaleReason[] {
  const reasons: StaleReason[] = [];
  if (isStale(row, now)) reasons.push('unused');
  if (!row.appliesToAllAgents && row.linkCount === 0) reasons.push('unlinked');
  return reasons;
}

/** Lexeme → number of positions, from a `tsvector::text` like `'bucket':1,7 'it''s':3`. */
export function parseTsvector(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of text.matchAll(/'((?:[^']|'')*)'(?::([0-9A-D,]+))?/g)) {
    out.set(m[1]!.replace(/''/g, "'"), m[2] ? m[2].split(',').length : 1);
  }
  return out;
}

/**
 * The AC-9 full-text score, computed without Postgres. For an OR-query over
 * unweighted lexemes every matched position is its own cover worth 0.1, so
 * `ts_rank_cd(tsv, q, 32)` = r/(r+1) with r = 0.1 × (positions of `tsv` whose
 * lexeme is in `q`). Pinned against Postgres in memory-curation.it.test.ts.
 */
export function ftsScore(matchedPositions: number): number {
  const r = 0.1 * matchedPositions;
  return r / (r + 1);
}

/**
 * Full-text "similar" pairs (score ≥ `min` in either direction) where at least
 * one side is in `ids`. An inverted index skips pairs sharing no lexeme, so a
 * 1,000-memory scan needs no per-pair database work.
 */
export function textPairs(rows: { id: string; lex: Map<string, number> }[], ids: Set<string>, min: number): SimilarPair[] {
  const byLexeme = new Map<string, number[]>();
  rows.forEach((r, i) => {
    for (const l of r.lex.keys()) {
      const list = byLexeme.get(l);
      if (list) list.push(i);
      else byLexeme.set(l, [i]);
    }
  });
  const matched = (from: Map<string, number>, to: Map<string, number>) => {
    let k = 0;
    for (const [l, n] of to) if (from.has(l)) k += n;
    return k;
  };
  const out: SimilarPair[] = [];
  rows.forEach((a, i) => {
    const candidates = new Set<number>();
    for (const l of a.lex.keys()) for (const j of byLexeme.get(l)!) if (j > i) candidates.add(j);
    for (const j of candidates) {
      const b = rows[j]!;
      if (!ids.has(a.id) && !ids.has(b.id)) continue;
      const score = ftsScore(Math.max(matched(a.lex, b.lex), matched(b.lex, a.lex)));
      if (score >= min) out.push({ a: a.id, b: b.id, score });
    }
  });
  return out;
}
