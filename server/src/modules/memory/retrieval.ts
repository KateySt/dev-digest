import type { MemoryPulled } from '@devdigest/shared';
import { matchesAnyGlob, type MemoryEntry } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { MemoryRepository, type ApplicableMemory } from './repository.js';
import { MemoryService } from './service.js';
import { sourcePrs } from './helpers.js';
import { MEMORY_LIST_LIMIT, MEMORY_MAX_ENTRIES, MEMORY_QUERY_DIFF_CHARS, MEMORY_TOKEN_BUDGET } from './constants.js';

/**
 * Run-time memory retrieval (SPEC-2026-10-12-memory AC-14..AC-19):
 * applicability filter (SQL) → path globs → rank → token budget → touch.
 * No LLM call; at most one embedding call (the query text).
 */

export interface MemoryRunContext {
  workspaceId: string;
  repoId: string;
  agentId: string;
  /** The agent's ACTIVE skills (enabled, not scan-blocked) — same set the prompt uses. */
  skillIds: string[];
  changedFiles: string[];
  queryText: string;
  model: string;
}

export interface ResolvedMemory {
  entries: MemoryEntry[];
  pulled: MemoryPulled[];
  ids: string[];
}

export const EMPTY_MEMORY: ResolvedMemory = { entries: [], pulled: [], ids: [] };

/** An agent installed in the exported repo, with its ACTIVE skill ids. */
export interface ExportAgent {
  slug: string;
  agentId: string;
  skillIds: string[];
}

export interface ExportedMemory {
  kind: MemoryEntry['kind'];
  content: string;
  path_globs: string[];
  /** null = applies to every agent. */
  agent_slugs: string[] | null;
}

type Rankable = { id: string; kind: MemoryEntry['kind']; content: string };

/** How an entry is rendered in `## Relevant memory` (reviewer-core prompt.ts). */
const rendered = (e: Rankable) => `- [${e.kind}] ${e.content}`;

/**
 * Greedy budget fill in rank order (AC-16): an entry that doesn't fit is
 * skipped WHOLE (a later, shorter one may still fit); never truncated.
 */
export function selectWithinBudget<T extends Rankable>(
  ranked: T[],
  countTokens: (s: string) => number,
  budget: number,
  maxEntries: number,
): T[] {
  const out: T[] = [];
  let used = 0;
  for (const e of ranked) {
    if (out.length >= maxEntries) break;
    const cost = countTokens(rendered(e)) + 1; // + newline
    if (used + cost > budget) continue;
    used += cost;
    out.push(e);
  }
  return out;
}

/** Ranking query for a PR: title + changed paths + the head of the diff. */
export function buildQueryText(prTitle: string, files: string[], diffRaw: string): string {
  return `${prTitle}\n${files.map((f) => `${f}\n`).join('')}${diffRaw.slice(0, MEMORY_QUERY_DIFF_CHARS)}`;
}

/** Order: relevance, then path-scoped matches, then confidence, then recency. */
function compare(a: ApplicableMemory, b: ApplicableMemory): number {
  return (
    b.score - a.score ||
    Number(b.pathGlobs.length > 0) - Number(a.pathGlobs.length > 0) ||
    b.confidence - a.confidence ||
    b.updatedAt.getTime() - a.updatedAt.getTime()
  );
}

export class MemoryRetriever {
  private repo: MemoryRepository;

  constructor(private container: Container) {
    this.repo = new MemoryRepository(container.db);
  }

  /**
   * CI export (AC-30): every memory of the repo (+ global) that applies to at
   * least one installed agent, tagged with those agents' slugs. A snapshot —
   * no ranking, no budget (the runner applies globs + the entry cap).
   */
  async resolveForExport(workspaceId: string, repoId: string | null, agents: ExportAgent[]): Promise<ExportedMemory[]> {
    const rows = await this.repo.exportCandidates(workspaceId, repoId);
    const out: ExportedMemory[] = [];
    for (const m of rows) {
      let slugs: string[] | null;
      if (m.appliesToAllAgents) {
        slugs = null;
      } else {
        slugs = agents
          .filter((a) => m.agentIds.includes(a.agentId) || a.skillIds.some((s) => m.skillIds.includes(s)))
          .map((a) => a.slug);
        if (slugs.length === 0) continue;
      }
      out.push({ kind: m.kind, content: m.content, path_globs: m.pathGlobs, agent_slugs: slugs });
      if (out.length >= MEMORY_LIST_LIMIT) break;
    }
    return out;
  }

  async resolveForRun(ctx: MemoryRunContext): Promise<ResolvedMemory> {
    const vec = await new MemoryService(this.container).embedOrNull(ctx.queryText);
    const candidates = await this.repo.applicable({
      workspaceId: ctx.workspaceId,
      repoId: ctx.repoId,
      agentId: ctx.agentId,
      skillIds: ctx.skillIds,
      vec,
      text: ctx.queryText,
    });
    const inScope = candidates.filter(
      (m) => m.pathGlobs.length === 0 || ctx.changedFiles.some((f) => matchesAnyGlob(f, m.pathGlobs)),
    );
    const chosen = selectWithinBudget(
      inScope.sort(compare),
      (s) => this.container.tokenizer.countFor(ctx.model, s).tokens,
      MEMORY_TOKEN_BUDGET,
      MEMORY_MAX_ENTRIES,
    );
    const ids = chosen.map((m) => m.id);
    await this.repo.touchLastUsed(ids, new Date());
    return {
      ids,
      entries: chosen.map((m) => ({ kind: m.kind, content: m.content })),
      pulled: chosen.map((m) => {
        const prs = sourcePrs(m.sources);
        return { id: m.id, kind: m.kind, pr: prs[0] ?? null, text: m.content, source_prs: prs };
      }),
    };
  }
}
