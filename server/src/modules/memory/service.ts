import {
  MemoryInput,
  type CreateMemoryBody,
  type Memory,
  type MemoryKind,
  type MemoryScope,
  type MemoryListQuery,
  type MemoryListResponse,
  type MemorySource,
  type MemorySummary,
  type MergeMemoryBody,
  type UpdateMemoryBody,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { MemoryRepository, type FindingSource, type MemoryRow, type MemorySearch } from './repository.js';
import { pageMeta, pageWindow, type PageQuery } from '../_shared/paging.js';
import { memoryRowToDto, validateMemoryInput } from './helpers.js';
import { MEMORY_DUP_COSINE, MEMORY_FTS_DUP_THRESHOLD, MEMORY_SIMILAR_LIMIT } from './constants.js';

/**
 * Memory & Learn (SPEC-2026-10-12-memory). Every write is human-confirmed: the
 * only callers are the Memory page and the Learn modal's Save / Merge.
 */
export class MemoryService {
  readonly repo: MemoryRepository;

  constructor(protected container: Container) {
    this.repo = new MemoryRepository(container.db);
  }

  /** With `page` (and optional `per_page`) one page plus `total`/`page`/`per_page`; without, the legacy capped list. */
  async list(
    workspaceId: string,
    query: MemoryListQuery & PageQuery & { scopes?: MemoryScope[]; kinds?: MemoryKind[] },
  ): Promise<MemoryListResponse & Partial<ReturnType<typeof pageMeta>>> {
    const window = pageWindow(query);
    const now = new Date();
    const filter = {
      repoId: query.repo_id,
      scope: query.scope,
      kind: query.kind,
      scopes: query.scopes,
      kinds: query.kinds,
      includeStale: query.stale === true,
      archived: query.archived === true,
      now,
    };
    const q = query.q?.trim();
    let search: MemorySearch | undefined;
    let mode: MemoryListResponse['search_mode'] = 'text';
    if (q) {
      const vec = await this.embedOrNull(q);
      search = vec ? { mode: 'semantic', vec } : { mode: 'text', q };
      mode = vec ? 'semantic' : 'text';
    } else if (await this.embeddingsAvailable()) {
      mode = 'semantic';
    }
    const [rows, counts, total] = await Promise.all([
      this.repo.list(workspaceId, filter, search, window ?? undefined),
      this.repo.counts(workspaceId, filter),
      window ? this.repo.total(workspaceId, filter, search) : Promise.resolve(0),
    ]);
    const items = await this.toDtos(rows, now);
    return window ? { items, counts, search_mode: mode, ...pageMeta(total, window) } : { items, counts, search_mode: mode };
  }

  async get(workspaceId: string, id: string): Promise<Memory> {
    const row = await this.repo.get(workspaceId, id);
    if (!row) throw new NotFoundError('Memory not found');
    return (await this.toDtos([row], new Date()))[0]!;
  }

  async create(workspaceId: string, userId: string, body: CreateMemoryBody): Promise<Memory> {
    const { finding_id: findingId, ...rest } = body;
    const input = MemoryInput.parse(rest);
    await this.validate(workspaceId, input);
    const finding = findingId ? await this.learnableFinding(workspaceId, findingId) : undefined;
    const source = finding ? findingToSource(finding, userId) : manualSource(userId);
    const embedding = await this.embedOrNull(input.content);

    const row = await this.repo.transaction(async (tx) => {
      const created = await tx.insert(workspaceId, writeOf(input, [source]), embedding);
      await tx.replaceLinks(created.id, input.links);
      if (finding && !(await tx.claimFinding(finding.findingId, created.id))) {
        throw new ConflictError('This finding was already learned.', undefined, 'already_learned');
      }
      return created;
    });
    return this.get(workspaceId, row.id);
  }

  async update(workspaceId: string, id: string, patch: UpdateMemoryBody): Promise<Memory> {
    const current = await this.get(workspaceId, id);
    const { archived, kept, ...fields } = patch;
    // Curation "Keep" never bumps updated_at (SPEC-2026-10-12-memory-curation AC-C20).
    if (kept) await this.repo.setKeptAt(workspaceId, id, new Date());
    // Archive / unarchive alone never re-validates: an Unlinked memory (its
    // agent was deleted, AC-13) must still be retirable (AC-27).
    if (Object.values(fields).every((v) => v === undefined)) {
      if (archived !== undefined) {
        await this.repo.update(workspaceId, id, archiveWrite(archived));
      }
      return this.get(workspaceId, id);
    }
    const merged = MemoryInput.parse({
      content: current.content,
      kind: current.kind,
      scope: current.scope,
      repo_id: current.repo_id,
      path_globs: current.path_globs,
      links: current.links.map(({ target_kind, target_id }) => ({ target_kind, target_id })),
      applies_to_all_agents: current.applies_to_all_agents,
      confidence: current.confidence,
      ...fields,
    });
    await this.validate(workspaceId, merged);
    const contentChanged = merged.content !== current.content;
    const embedding = contentChanged ? await this.embedOrNull(merged.content) : undefined;
    await this.repo.transaction(async (tx) => {
      await tx.update(workspaceId, id, {
        ...writeOf(merged, current.sources),
        ...(contentChanged ? { embedding } : {}),
        ...(archived === undefined ? {} : archiveWrite(archived)),
      });
      if (fields.links !== undefined) await tx.replaceLinks(id, merged.links);
    });
    return this.get(workspaceId, id);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    if (!(await this.repo.delete(workspaceId, id))) throw new NotFoundError('Memory not found');
  }

  /** AC-10: fold a new Learn into an existing memory instead of creating a duplicate. */
  async merge(workspaceId: string, userId: string, id: string, body: MergeMemoryBody): Promise<Memory> {
    const current = await this.get(workspaceId, id);
    const finding = body.finding_id ? await this.learnableFinding(workspaceId, body.finding_id) : undefined;
    const source = finding ? findingToSource(finding, userId) : manualSource(userId);
    const embedding = body.content !== current.content ? await this.embedOrNull(body.content) : undefined;
    await this.repo.transaction(async (tx) => {
      await tx.update(workspaceId, id, {
        content: body.content,
        ...(embedding !== undefined ? { embedding } : {}),
        confidence: Math.max(current.confidence, body.confidence),
        sources: [...current.sources, source],
      });
      if (finding && !(await tx.claimFinding(finding.findingId, id))) {
        throw new ConflictError('This finding was already learned.', undefined, 'already_learned');
      }
    });
    return this.get(workspaceId, id);
  }

  /** AC-9: up to 3 very similar, non-archived memories in the same repo or global. */
  async similar(workspaceId: string, content: string, repoId: string | null): Promise<MemorySummary[]> {
    const text = content.trim();
    if (!text) return [];
    const vec = await this.embedOrNull(text);
    if (vec) {
      return this.repo.similarByEmbedding(workspaceId, repoId, vec, MEMORY_SIMILAR_LIMIT, MEMORY_DUP_COSINE);
    }
    return this.repo.similarByText(workspaceId, repoId, text, MEMORY_SIMILAR_LIMIT, MEMORY_FTS_DUP_THRESHOLD);
  }

  /**
   * Embed one text, or null when embeddings are disabled / failing (AC-22).
   * Never throws: memory must work fully on the full-text path.
   */
  async embedOrNull(text: string): Promise<number[] | null> {
    try {
      const embedder = await this.container.embedder();
      const [vec] = await embedder.embed([text]);
      return vec ?? null;
    } catch {
      return null;
    }
  }

  private async embeddingsAvailable(): Promise<boolean> {
    try {
      await this.container.embedder();
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------

  protected async toDtos(rows: MemoryRow[], now: Date): Promise<Memory[]> {
    const links = await this.repo.linksFor(rows.map((r) => r.id));
    return rows.map((r) => memoryRowToDto(r, links.get(r.id) ?? [], now));
  }

  protected async validate(workspaceId: string, input: MemoryInput): Promise<void> {
    const agentIds = input.links.filter((l) => l.target_kind === 'agent').map((l) => l.target_id);
    const skillIds = input.links.filter((l) => l.target_kind === 'skill').map((l) => l.target_id);
    const [agents, skillRepoIds] = await Promise.all([
      this.repo.agentIdsIn(workspaceId, agentIds),
      this.repo.skillRepoIds(workspaceId, skillIds),
    ]);
    if (agentIds.some((a) => !agents.has(a)) || skillIds.some((s) => !skillRepoIds.has(s))) {
      throw new ValidationError('A linked agent or skill does not exist');
    }
    if (input.repo_id && !(await this.repo.repoExists(workspaceId, input.repo_id))) {
      throw new ValidationError('Repository not found');
    }
    validateMemoryInput(input, { skillRepoIds });
  }

  /** The finding must exist in this workspace and not be learned yet (AC-7). */
  protected async learnableFinding(workspaceId: string, findingId: string): Promise<FindingSource> {
    const finding = await this.repo.findingSource(workspaceId, findingId);
    if (!finding) throw new NotFoundError('Finding not found');
    if (finding.memoryId) {
      throw new ConflictError('This finding was already learned.', { memory_id: finding.memoryId }, 'already_learned');
    }
    return finding;
  }
}

/** Unarchive also forgets which memory a curation merge folded this one into (AC-C22). */
function archiveWrite(archived: boolean) {
  return archived ? { archivedAt: new Date() } : { archivedAt: null, mergedInto: null };
}

export function writeOf(input: MemoryInput, sources: MemorySource[]) {
  return {
    repoId: input.scope === 'repo' ? input.repo_id : null,
    scope: input.scope,
    kind: input.kind,
    content: input.content,
    confidence: input.confidence,
    sources,
    pathGlobs: input.path_globs,
    appliesToAllAgents: input.applies_to_all_agents,
  };
}

export function findingToSource(f: FindingSource, userId: string | null): MemorySource {
  return {
    pr: f.prNumber,
    context: `finding: ${f.title}`,
    finding_id: f.findingId,
    review_id: f.reviewId,
    agent_id: f.agentId,
    created_by: userId,
    created_at: new Date().toISOString(),
  };
}

function manualSource(userId: string): MemorySource {
  return { pr: null, context: 'manual', created_by: userId, created_at: new Date().toISOString() };
}
