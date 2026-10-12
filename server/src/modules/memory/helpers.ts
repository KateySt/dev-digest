import { MEMORY_CONTENT_MAX } from '@devdigest/shared';
import type { Memory, MemoryDraft, MemoryInput, MemoryKind, MemoryLink, MemoryScope, MemorySource } from '@devdigest/shared';
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

export function isStale(row: { lastUsedAt: Date | null; createdAt: Date }, now: Date): boolean {
  const ref = row.lastUsedAt ?? row.createdAt;
  return now.getTime() - ref.getTime() > MEMORY_STALE_DAYS * DAY_MS;
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
