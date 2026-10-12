import { and, desc, eq, gte, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { MemoryKind, MemoryLink, MemoryScope, MemorySource, MemorySummary } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { MEMORY_LIST_LIMIT, MEMORY_SEARCH_MIN_COSINE, MEMORY_STALE_DAYS } from './constants.js';
import type { LinkWithName } from './helpers.js';

/**
 * Memory data-access (SPEC-2026-10-12-memory). Owns `memory` + `memory_links`
 * and the `findings.memory_id` back-link. Workspace-scoped throughout.
 *
 * Reads never select `embedding` / `content_tsv` (1536 floats per row) unless
 * a query ranks by them.
 */

export type MemoryRow = Omit<typeof t.memory.$inferSelect, 'embedding' | 'contentTsv'>;

const cols = {
  id: t.memory.id,
  workspaceId: t.memory.workspaceId,
  repoId: t.memory.repoId,
  scope: t.memory.scope,
  kind: t.memory.kind,
  content: t.memory.content,
  confidence: t.memory.confidence,
  sources: t.memory.sources,
  pathGlobs: t.memory.pathGlobs,
  appliesToAllAgents: t.memory.appliesToAllAgents,
  archivedAt: t.memory.archivedAt,
  createdAt: t.memory.createdAt,
  updatedAt: t.memory.updatedAt,
  lastUsedAt: t.memory.lastUsedAt,
};

export interface MemoryWrite {
  repoId: string | null;
  scope: MemoryScope;
  kind: MemoryKind;
  content: string;
  confidence: number;
  sources: MemorySource[];
  pathGlobs: string[];
  appliesToAllAgents: boolean;
}

export interface MemoryListFilter {
  repoId?: string;
  scope?: MemoryScope;
  kind?: MemoryKind;
  includeStale: boolean;
  archived: boolean;
  now: Date;
}

export type MemorySearch = { mode: 'semantic'; vec: number[] } | { mode: 'text'; q: string };

/** Everything Learn needs about a finding (draft input + provenance). */
export interface FindingSource {
  findingId: string;
  memoryId: string | null;
  reviewId: string;
  agentId: string | null;
  prNumber: number;
  prTitle: string;
  repoId: string;
  title: string;
  rationale: string;
  suggestion: string | null;
  file: string;
  category: string;
  severity: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

/** OR-of-words tsquery: `plainto_tsquery` ANDs every word, which almost never
 *  matches a whole sentence against another sentence. */
export function orTsQuery(text: string): SQL {
  return sql`replace(plainto_tsquery('english', ${text})::text, '&', '|')::tsquery`;
}

export class MemoryRepository {
  constructor(private db: Db) {}

  /** Run `fn` against a repository bound to one transaction. */
  async transaction<T>(fn: (repo: MemoryRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(new MemoryRepository(tx as unknown as Db)));
  }

  private baseWhere(workspaceId: string, f: Omit<MemoryListFilter, 'scope' | 'kind'>): SQL[] {
    const where: SQL[] = [eq(t.memory.workspaceId, workspaceId)];
    if (f.repoId) where.push(or(eq(t.memory.repoId, f.repoId), eq(t.memory.scope, 'global'))!);
    where.push(f.archived ? isNotNull(t.memory.archivedAt) : isNull(t.memory.archivedAt));
    if (!f.includeStale) {
      const cutoff = new Date(f.now.getTime() - MEMORY_STALE_DAYS * 86_400_000);
      where.push(sql`coalesce(${t.memory.lastUsedAt}, ${t.memory.createdAt}) >= ${cutoff.toISOString()}::timestamptz`);
    }
    return where;
  }

  async list(workspaceId: string, f: MemoryListFilter, search?: MemorySearch): Promise<MemoryRow[]> {
    const where = this.baseWhere(workspaceId, f);
    if (f.scope) where.push(eq(t.memory.scope, f.scope));
    if (f.kind) where.push(eq(t.memory.kind, f.kind));

    if (search?.mode === 'text') {
      const q = orTsQuery(search.q);
      where.push(sql`${t.memory.contentTsv} @@ ${q}`);
      return this.db
        .select(cols)
        .from(t.memory)
        .where(and(...where))
        .orderBy(desc(sql`ts_rank_cd(${t.memory.contentTsv}, ${q}, 32)`), desc(t.memory.updatedAt))
        .limit(MEMORY_LIST_LIMIT);
    }
    if (search?.mode === 'semantic') {
      where.push(
        sql`1 - (${t.memory.embedding} <=> ${JSON.stringify(search.vec)}::vector) >= ${MEMORY_SEARCH_MIN_COSINE}`,
      );
      return this.db
        .select(cols)
        .from(t.memory)
        .where(and(...where))
        .orderBy(sql`${t.memory.embedding} <=> ${JSON.stringify(search.vec)}::vector nulls last`)
        .limit(MEMORY_LIST_LIMIT);
    }
    return this.db
      .select(cols)
      .from(t.memory)
      .where(and(...where))
      .orderBy(desc(t.memory.updatedAt))
      .limit(MEMORY_LIST_LIMIT);
  }

  /** Facet counts over the base filter, ignoring the scope/kind filters they describe. */
  async counts(
    workspaceId: string,
    f: MemoryListFilter,
  ): Promise<{ scope: Record<string, number>; kind: Record<string, number> }> {
    const where = and(...this.baseWhere(workspaceId, f));
    const [byScope, byKind] = await Promise.all([
      this.db
        .select({ key: t.memory.scope, n: sql<number>`count(*)::int` })
        .from(t.memory)
        .where(f.kind ? and(where, eq(t.memory.kind, f.kind)) : where)
        .groupBy(t.memory.scope),
      this.db
        .select({ key: t.memory.kind, n: sql<number>`count(*)::int` })
        .from(t.memory)
        .where(f.scope ? and(where, eq(t.memory.scope, f.scope)) : where)
        .groupBy(t.memory.kind),
    ]);
    return {
      scope: Object.fromEntries(byScope.map((r) => [r.key, r.n])),
      kind: Object.fromEntries(byKind.map((r) => [r.key, r.n])),
    };
  }

  async get(workspaceId: string, id: string): Promise<MemoryRow | undefined> {
    const [row] = await this.db
      .select(cols)
      .from(t.memory)
      .where(and(eq(t.memory.workspaceId, workspaceId), eq(t.memory.id, id)));
    return row;
  }

  async insert(workspaceId: string, w: MemoryWrite, embedding: number[] | null): Promise<MemoryRow> {
    const [row] = await this.db
      .insert(t.memory)
      .values({ workspaceId, ...w, embedding })
      .returning(cols);
    return row!;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: Partial<MemoryWrite> & { archivedAt?: Date | null; embedding?: number[] | null },
  ): Promise<MemoryRow | undefined> {
    const [row] = await this.db
      .update(t.memory)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(t.memory.workspaceId, workspaceId), eq(t.memory.id, id)))
      .returning(cols);
    return row;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.memory)
      .where(and(eq(t.memory.workspaceId, workspaceId), eq(t.memory.id, id)))
      .returning({ id: t.memory.id });
    return rows.length > 0;
  }

  async replaceLinks(memoryId: string, links: MemoryLink[]): Promise<void> {
    await this.db.delete(t.memoryLinks).where(eq(t.memoryLinks.memoryId, memoryId));
    if (links.length === 0) return;
    await this.db.insert(t.memoryLinks).values(
      links.map((l) => ({
        memoryId,
        agentId: l.target_kind === 'agent' ? l.target_id : null,
        skillId: l.target_kind === 'skill' ? l.target_id : null,
      })),
    );
  }

  /** Links (with display names) for many memories at once. */
  async linksFor(memoryIds: string[]): Promise<Map<string, LinkWithName[]>> {
    const out = new Map<string, LinkWithName[]>();
    if (memoryIds.length === 0) return out;
    const rows = await this.db
      .select({
        memoryId: t.memoryLinks.memoryId,
        agentId: t.memoryLinks.agentId,
        skillId: t.memoryLinks.skillId,
        agentName: t.agents.name,
        skillName: t.skills.name,
      })
      .from(t.memoryLinks)
      .leftJoin(t.agents, eq(t.agents.id, t.memoryLinks.agentId))
      .leftJoin(t.skills, eq(t.skills.id, t.memoryLinks.skillId))
      .where(inArray(t.memoryLinks.memoryId, memoryIds));
    for (const r of rows) {
      const link: LinkWithName = r.agentId
        ? { target_kind: 'agent', target_id: r.agentId, name: r.agentName ?? '' }
        : { target_kind: 'skill', target_id: r.skillId!, name: r.skillName ?? '' };
      out.set(r.memoryId, [...(out.get(r.memoryId) ?? []), link]);
    }
    return out;
  }

  async agentIdsIn(workspaceId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), inArray(t.agents.id, ids)));
    return new Set(rows.map((r) => r.id));
  }

  /** skill id → repo id (null = global skill), workspace-scoped. */
  async skillRepoIds(workspaceId: string, ids: string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: t.skills.id, repoId: t.skills.repoId })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, ids)));
    return new Map(rows.map((r) => [r.id, r.repoId]));
  }

  async repoExists(workspaceId: string, repoId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return !!row;
  }

  async findingSource(workspaceId: string, findingId: string): Promise<FindingSource | undefined> {
    const [row] = await this.db
      .select({
        findingId: t.findings.id,
        memoryId: t.findings.memoryId,
        reviewId: t.findings.reviewId,
        agentId: t.reviews.agentId,
        prNumber: t.pullRequests.number,
        prTitle: t.pullRequests.title,
        repoId: t.pullRequests.repoId,
        title: t.findings.title,
        rationale: t.findings.rationale,
        suggestion: t.findings.suggestion,
        file: t.findings.file,
        category: t.findings.category,
        severity: t.findings.severity,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
      .where(and(eq(t.findings.id, findingId), eq(t.pullRequests.workspaceId, workspaceId)));
    return row;
  }

  /** Link a finding to its memory only if it isn't learned yet (atomic —
   *  Save stays idempotent per finding under concurrent requests). */
  async claimFinding(findingId: string, memoryId: string): Promise<boolean> {
    const rows = await this.db
      .update(t.findings)
      .set({ memoryId })
      .where(and(eq(t.findings.id, findingId), isNull(t.findings.memoryId)))
      .returning({ id: t.findings.id });
    return rows.length > 0;
  }

  private scopeFilter(workspaceId: string, repoId: string | null): SQL {
    return and(
      eq(t.memory.workspaceId, workspaceId),
      isNull(t.memory.archivedAt),
      repoId ? or(eq(t.memory.repoId, repoId), eq(t.memory.scope, 'global')) : undefined,
    )!;
  }

  async similarByEmbedding(
    workspaceId: string,
    repoId: string | null,
    vec: number[],
    limit: number,
    minSimilarity: number,
  ): Promise<MemorySummary[]> {
    const sim = sql<number>`1 - (${t.memory.embedding} <=> ${JSON.stringify(vec)}::vector)`;
    const rows = await this.db
      .select({ id: t.memory.id, content: t.memory.content, kind: t.memory.kind, scope: t.memory.scope, similarity: sim })
      .from(t.memory)
      .where(and(this.scopeFilter(workspaceId, repoId), isNotNull(t.memory.embedding), gte(sim, minSimilarity)))
      .orderBy(desc(sim))
      .limit(limit);
    return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
  }

  async similarByText(
    workspaceId: string,
    repoId: string | null,
    text: string,
    limit: number,
    minRank: number,
  ): Promise<MemorySummary[]> {
    const q = orTsQuery(text);
    const rank = sql<number>`ts_rank_cd(${t.memory.contentTsv}, ${q}, 32)`;
    const rows = await this.db
      .select({ id: t.memory.id, content: t.memory.content, kind: t.memory.kind, scope: t.memory.scope, similarity: rank })
      .from(t.memory)
      .where(and(this.scopeFilter(workspaceId, repoId), sql`${t.memory.contentTsv} @@ ${q}`, gte(rank, minRank)))
      .orderBy(desc(rank))
      .limit(limit);
    return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
  }

  /**
   * Applicability (spec "Domain model"): same workspace, not archived, global
   * or this repo, and linked to this agent / one of its active skills / all
   * agents. Path globs are filtered by the caller (needs the changed files).
   */
  async applicable(q: ApplicableQuery): Promise<ApplicableMemory[]> {
    const linkedToAgent = sql`exists (select 1 from ${t.memoryLinks} ml where ml.memory_id = ${t.memory.id} and ml.agent_id = ${q.agentId})`;
    const linkedToSkill =
      q.skillIds.length > 0
        ? sql`exists (select 1 from ${t.memoryLinks} ml where ml.memory_id = ${t.memory.id} and ml.skill_id in (${sql.join(
            q.skillIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}))`
        : sql`false`;
    // Rows without an embedding (saved during an outage / before embeddings
    // were enabled) fall back to full-text instead of scoring 0 (AC-22).
    const fts = sql`ts_rank_cd(${t.memory.contentTsv}, ${orTsQuery(q.text)}, 32)`;
    const score = q.vec
      ? sql<number>`coalesce(1 - (${t.memory.embedding} <=> ${JSON.stringify(q.vec)}::vector), ${fts})`
      : sql<number>`${fts}`;
    const rows = await this.db
      .select({
        id: t.memory.id,
        kind: t.memory.kind,
        content: t.memory.content,
        sources: t.memory.sources,
        pathGlobs: t.memory.pathGlobs,
        confidence: t.memory.confidence,
        updatedAt: t.memory.updatedAt,
        score,
      })
      .from(t.memory)
      .where(
        and(
          eq(t.memory.workspaceId, q.workspaceId),
          isNull(t.memory.archivedAt),
          or(eq(t.memory.scope, 'global'), eq(t.memory.repoId, q.repoId)),
          or(eq(t.memory.appliesToAllAgents, true), linkedToAgent, linkedToSkill),
        ),
      );
    return rows.map((r) => ({
      ...r,
      kind: r.kind as MemoryKind,
      sources: (r.sources as MemorySource[] | null) ?? [],
      confidence: r.confidence ?? 0,
      score: Number(r.score),
    }));
  }

  /** Non-archived memories of a repo (+ global) with their raw link targets — CI export. */
  async exportCandidates(
    workspaceId: string,
    repoId: string | null,
  ): Promise<(ApplicableMemory & { appliesToAllAgents: boolean; agentIds: string[]; skillIds: string[] })[]> {
    const rows = await this.db
      .select({
        id: t.memory.id,
        kind: t.memory.kind,
        content: t.memory.content,
        sources: t.memory.sources,
        pathGlobs: t.memory.pathGlobs,
        confidence: t.memory.confidence,
        updatedAt: t.memory.updatedAt,
        appliesToAllAgents: t.memory.appliesToAllAgents,
      })
      .from(t.memory)
      .where(
        and(
          eq(t.memory.workspaceId, workspaceId),
          isNull(t.memory.archivedAt),
          repoId ? or(eq(t.memory.scope, 'global'), eq(t.memory.repoId, repoId)) : eq(t.memory.scope, 'global'),
        ),
      )
      .orderBy(desc(t.memory.confidence), desc(t.memory.updatedAt));
    const links =
      rows.length === 0
        ? []
        : await this.db
            .select({ memoryId: t.memoryLinks.memoryId, agentId: t.memoryLinks.agentId, skillId: t.memoryLinks.skillId })
            .from(t.memoryLinks)
            .where(inArray(t.memoryLinks.memoryId, rows.map((r) => r.id)));
    return rows.map((r) => ({
      ...r,
      kind: r.kind as MemoryKind,
      sources: (r.sources as MemorySource[] | null) ?? [],
      confidence: r.confidence ?? 0,
      score: 0,
      agentIds: links.filter((l) => l.memoryId === r.id && l.agentId).map((l) => l.agentId!),
      skillIds: links.filter((l) => l.memoryId === r.id && l.skillId).map((l) => l.skillId!),
    }));
  }

  async touchLastUsed(ids: string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.db.update(t.memory).set({ lastUsedAt: at }).where(inArray(t.memory.id, ids));
  }
}

/** One candidate for injection, with its relevance score for the PR. */
export interface ApplicableMemory {
  id: string;
  kind: MemoryKind;
  content: string;
  sources: MemorySource[];
  pathGlobs: string[];
  confidence: number;
  updatedAt: Date;
  score: number;
}

export interface ApplicableQuery {
  workspaceId: string;
  repoId: string;
  agentId: string;
  skillIds: string[];
  /** Ranking input: cosine against `vec` when present, else full-text against `text`. */
  vec: number[] | null;
  text: string;
}
