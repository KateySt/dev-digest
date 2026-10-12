import { z } from 'zod';
import {
  CURATE_MAX_GROUP_SIZE,
  MEMORY_CONTENT_MAX,
  type CurateMergeBody,
  type CurateMergeDraftResponse,
  type CurateScanResponse,
  type Memory,
  type MemorySource,
  type StaleCandidate,
} from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { MemoryService, writeOf } from './service.js';
import type { CurationRow, MemoryRow } from './repository.js';
import { MERGE_DRAFT_SYSTEM_PROMPT } from './prompts.js';
import {
  embeddingPairs,
  groupPairs,
  parseTsvector,
  pickPrimary,
  staleClock,
  staleReasons,
  textPairs,
  trimGroup,
  type SimilarPair,
} from './helpers.js';
import {
  CURATE_MAX_GROUPS,
  CURATE_MAX_STALE,
  LEARN_DRAFT_TIMEOUT_MS,
  MEMORY_DUP_COSINE,
  MEMORY_FTS_DUP_THRESHOLD,
  MERGE_DRAFT_SCHEMA_NAME,
} from './constants.js';

/** What the model returns for a merge draft (AC-C11). */
const LlmMergeDraft = z.object({ content: z.string().min(1) });

/** AC-C17: a member changed (edited, archived, deleted) since the scan. */
function conflict(): never {
  throw new ConflictError('A memory changed since the scan. Re-scan and try again.', undefined, 'curation_stale');
}

function assertUnchanged(rows: { id: string; updatedAt: Date }[], expected: Record<string, string>): void {
  if (rows.some((r) => r.updatedAt.toISOString() !== expected[r.id])) conflict();
}

/**
 * Memory curation (SPEC-2026-10-12-memory-curation). Runs only on an explicit
 * user click. The scan is a dry run: it proposes merges and retirements and
 * writes nothing (AC-C3). Every change is applied by its own request.
 */
export class CurationService extends MemoryService {
  constructor(container: Container) {
    super(container);
  }

  async scan(workspaceId: string, repoId: string | null): Promise<CurateScanResponse> {
    const now = new Date();
    const rows = await this.repo.curationRows(workspaceId, repoId);
    const vectors = await this.vectorsFor(rows);

    const withVec = rows.filter((r) => vectors.has(r.id)).map((r) => ({ id: r.id, vec: vectors.get(r.id)! }));
    const withoutVec = rows.filter((r) => !vectors.has(r.id)).map((r) => r.id);
    const pairs: SimilarPair[] = [
      ...embeddingPairs(withVec, MEMORY_DUP_COSINE),
      ...textPairs(
        rows.map((r) => ({ id: r.id, lex: parseTsvector(r.tsv) })),
        new Set(withoutVec),
        MEMORY_FTS_DUP_THRESHOLD,
      ),
    ];

    const byId = new Map(rows.map((r) => [r.id, r]));
    const components = groupPairs(
      rows.map((r) => r.id),
      pairs,
    );
    const groups = components
      .map((ids) => {
        const primaryId = pickPrimary(ids.map((id) => byId.get(id)!));
        const kept = trimGroup(ids, primaryId, pairs, CURATE_MAX_GROUP_SIZE);
        const inGroup = new Set(kept);
        const similarity = Math.max(...pairs.filter((p) => inGroup.has(p.a) && inGroup.has(p.b)).map((p) => p.score));
        return { ids: kept, primaryId, similarity };
      })
      .sort((x, y) => y.similarity - x.similarity);
    const shownGroups = groups.slice(0, CURATE_MAX_GROUPS);
    const grouped = new Set(shownGroups.flatMap((g) => g.ids));

    // A memory that has duplicates is not also proposed for retirement (AC-C6) —
    // including members cut by the group-size or group-count caps.
    const hasDuplicates = new Set(components.flat());
    const stale = rows
      .filter((r) => !hasDuplicates.has(r.id))
      .map((r) => ({ row: r, reasons: staleReasons(r, now) }))
      .filter((c) => c.reasons.length > 0)
      .sort((x, y) => staleClock(x.row).getTime() - staleClock(y.row).getTime());
    const shownStale = stale.slice(0, CURATE_MAX_STALE);

    const shownRows = [...grouped, ...shownStale.map((c) => c.row.id)].map((id) => byId.get(id)!);
    const dtos = new Map((await this.toDtos(shownRows, now)).map((m) => [m.id, m]));
    return {
      groups: shownGroups.map((g) => ({
        members: g.ids.map((id) => dtos.get(id)!),
        primary_id: g.primaryId,
        similarity: g.similarity,
      })),
      stale: shownStale.map((c): StaleCandidate => ({ memory: dtos.get(c.row.id)!, reasons: c.reasons })),
      totals: { groups: groups.length, stale: stale.length },
      mode: withoutVec.length > 0 ? 'text' : 'semantic',
    };
  }

  /** AC-C11/AC-C12: one LLM call that merges the members' text. Persists nothing. */
  async mergeDraft(workspaceId: string, memberIds: string[]): Promise<CurateMergeDraftResponse> {
    const rows = await this.loadMembers(workspaceId, memberIds);
    const primary = rows.find((r) => r.id === pickPrimary(rows))!;
    try {
      return { content: await this.llmMergeDraft(workspaceId, rows), fallback: false };
    } catch {
      return { content: primary.content, fallback: true };
    }
  }

  /**
   * AC-C15..AC-C18: fold the members into the primary in one transaction.
   * Merged-away members are archived with `merged_into`, never deleted.
   */
  async mergeGroup(workspaceId: string, body: CurateMergeBody): Promise<Memory> {
    const ids = body.member_ids;
    if (new Set(ids).size !== ids.length) throw new ValidationError('Duplicate member ids');
    if (!ids.includes(body.primary_id)) throw new ValidationError('The primary must be one of the members');
    if (ids.some((id) => body.expected[id] === undefined)) throw new ValidationError('Missing expected updated_at');

    const rows = await this.loadMembers(workspaceId, ids, { conflictIfMissing: true });
    assertUnchanged(rows, body.expected);
    const repoId = body.repo_id ?? null;
    for (const r of rows) {
      if (r.archivedAt) throw new ValidationError('An archived memory cannot be merged');
      if (r.scope !== 'global' && r.repoId !== repoId) throw new ValidationError('A member is outside the curated scope');
    }
    const { result } = body;
    if (result.scope === 'repo' && result.repo_id !== repoId) {
      throw new ValidationError('The merged memory can only be global or in the curated repo');
    }
    await this.validate(workspaceId, result);

    const primary = rows.find((r) => r.id === body.primary_id)!;
    const others = rows.filter((r) => r.id !== primary.id);
    const embedding = result.content !== primary.content ? await this.embedOrNull(result.content) : undefined;
    const sourcesOf = (r: MemoryRow) => (r.sources as MemorySource[] | null) ?? [];
    const sources = [...sourcesOf(primary), ...others.flatMap(sourcesOf)];
    const used = rows.map((r) => r.lastUsedAt).filter((d): d is Date => d !== null);
    const lastUsedAt = used.length > 0 ? new Date(Math.max(...used.map((d) => d.getTime()))) : null;

    await this.repo.transaction(async (tx) => {
      // Re-check inside the transaction: a concurrent edit loses to nobody silently.
      assertUnchanged(
        await Promise.all(ids.map(async (id) => (await tx.get(workspaceId, id)) ?? conflict())),
        body.expected,
      );
      await tx.update(workspaceId, primary.id, {
        ...writeOf(result, sources),
        lastUsedAt,
        ...(embedding !== undefined ? { embedding } : {}),
      });
      await tx.replaceLinks(primary.id, result.links);
      await tx.repointFindings(
        others.map((r) => r.id),
        primary.id,
      );
      await tx.archiveMerged(
        workspaceId,
        others.map((r) => r.id),
        primary.id,
        new Date(),
      );
    });
    return this.get(workspaceId, primary.id);
  }

  private async loadMembers(
    workspaceId: string,
    ids: string[],
    opts: { conflictIfMissing?: boolean } = {},
  ): Promise<MemoryRow[]> {
    const rows = await Promise.all(ids.map((id) => this.repo.get(workspaceId, id)));
    if (rows.some((r) => !r)) {
      if (opts.conflictIfMissing) conflict();
      throw new NotFoundError('Memory not found');
    }
    return rows as MemoryRow[];
  }

  private async llmMergeDraft(workspaceId: string, rows: MemoryRow[]): Promise<string> {
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'memory');
    const llm = await this.container.llm(provider);
    const user = rows.map((r, i) => `## Memory ${i + 1} (${r.kind})\n${wrapUntrusted('memory', r.content)}`).join('\n\n');
    const call = llm.completeStructured({
      model,
      schema: LlmMergeDraft,
      schemaName: MERGE_DRAFT_SCHEMA_NAME,
      messages: [
        { role: 'system', content: MERGE_DRAFT_SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('merge draft timed out')), LEARN_DRAFT_TIMEOUT_MS);
    });
    const res = await Promise.race([call, timeout]).finally(() => clearTimeout(timer));
    const content = res.data.content.trim().slice(0, MEMORY_CONTENT_MAX).trim();
    if (!content) throw new Error('empty merge draft');
    return content;
  }

  /**
   * Stored embeddings, plus in-memory embeddings for rows saved without one
   * (never persisted — the scan is read-only). Empty when embeddings are off.
   */
  private async vectorsFor(rows: CurationRow[]): Promise<Map<string, number[]>> {
    const out = new Map<string, number[]>();
    let embedder;
    try {
      embedder = await this.container.embedder();
    } catch {
      return out;
    }
    for (const r of rows) if (r.embedding) out.set(r.id, r.embedding);
    const missing = rows.filter((r) => !r.embedding);
    if (missing.length === 0) return out;
    try {
      const vecs = await embedder.embed(missing.map((r) => r.content));
      missing.forEach((r, i) => {
        if (vecs[i]) out.set(r.id, vecs[i]!);
      });
    } catch {
      // these rows stay on the full-text path (AC-C4)
    }
    return out;
  }
}
