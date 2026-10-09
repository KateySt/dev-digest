import type { Container } from '../../platform/container.js';
import type {
  ProjectContextAttachment,
  ProjectContextList,
  SkillScanFinding,
  SkillScanStatus,
  SpecFile,
  SpecReadOutcome,
} from '@devdigest/shared';
import { isScanBlocking } from '../skills/helpers.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { ProjectContextRepository } from './repository.js';
import {
  computeCoverage,
  dedupePaths,
  isAllowedDocumentPath,
  normalizeRelativePath,
  resolveAttachedPaths,
  sourceFolderFor,
  buildSpecsRead,
  type AgentUsageInput,
  type SkillContribution,
  type SkillUsageInput,
} from './helpers.js';
import { MAX_DOCUMENT_BYTES, PROJECT_CONTEXT_TOKEN_BUDGET } from './constants.js';

/** Which agent/skill (if any) a token-count request is scoped to — decides
 *  which model's tokenizer is used (S-AC-5). Both absent ⇒ always estimated
 *  (Open question 2 — the bare Project Context page total is never scoped to
 *  a model). */
export interface DocScope {
  agentId?: string;
  skillId?: string;
}

export interface SaveResult {
  ok: boolean;
  reason?: 'no_clone' | 'invalid_path' | 'outside_clone' | 'too_large';
  document?: SpecFile;
}

export interface ResolvedRunContext {
  /** Full text of every injected document, in resolved order — feeds
   *  `PromptParts.specs` directly (AC-15). */
  texts: string[];
  /** One entry per attached path (AC-19). */
  specsRead: { path: string; outcome: SpecReadOutcome }[];
}

/**
 * SPEC-04 (Project Context) — Ring 1 orchestration. Talks to
 * `ProjectContextRepository` (Drizzle + clone fs), `container.tokenizer`,
 * and the pure functions in `helpers.ts` — never touches `fs` or Drizzle
 * directly itself.
 */
export class ProjectContextService {
  private repo: ProjectContextRepository;

  constructor(private container: Container) {
    this.repo = new ProjectContextRepository(container.db);
  }

  // ---- discovery / refresh (AC-1..4) ---------------------------------------

  /** Both the plain list and the explicit refresh call this — there is no
   *  background/scheduled scan to distinguish from (an explicit non-goal), so
   *  "refresh" is simply "scan now, synchronously", same as a plain GET. */
  async list(workspaceId: string, repoId: string, scope: DocScope): Promise<ProjectContextList> {
    const repoRow = await this.repo.getRepoClone(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    if (!repoRow.clonePath) {
      // AC-2: no clone on disk yet — degraded, not an error.
      return { documents: [], degraded: true, last_refreshed_at: null };
    }

    const [files, model, modifiedRaw, usage] = await Promise.all([
      this.repo.scanDocuments(repoRow.clonePath),
      this.resolveModel(scope),
      this.container.gitStatus.modifiedPaths(repoRow.clonePath),
      this.usageContext(workspaceId),
    ]);
    const modifiedSet = new Set(modifiedRaw.filter(isAllowedDocumentPath));

    const documents: SpecFile[] = [];
    for (const file of files) {
      const read = await this.repo.readDocument(repoRow.clonePath, file.path);
      // Refused (symlink/escape) or oversized files contribute no tokens (AC-30, AC-32).
      const content = read.kind === 'ok' ? read.content : '';
      const { tokens, estimated } = this.container.tokenizer.countFor(model, content);
      const { coveragePct, usedByAgents } = computeCoverage(file.path, usage.agents, usage.skills);
      documents.push({
        path: file.path,
        size: file.size,
        source_folder: sourceFolderFor(file.path),
        tokens,
        tokens_estimated: estimated,
        coverage_pct: coveragePct,
        used_by_agents: usedByAgents,
        locally_modified: modifiedSet.has(file.path),
      });
    }
    documents.sort((a, b) => a.path.localeCompare(b.path));

    return { documents, degraded: false, last_refreshed_at: new Date().toISOString() };
  }

  // ---- one document — read / create / save (AC-23..27) --------------------

  async readOne(workspaceId: string, repoId: string, path: string, scope: DocScope): Promise<SpecFile | null> {
    const repoRow = await this.repo.getRepoClone(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    if (!repoRow.clonePath) return null;

    const normalized = normalizeRelativePath(path);
    // SECURITY (AC-24 parity): a direct read must be restricted to the same
    // `.md` + allowlisted-segment set discovery already limits itself to —
    // without this, GET .../context/document?path=... could read ANY file
    // inside the clone (.env, .git/config, …), not just project-context docs.
    if (!normalized || !isAllowedDocumentPath(normalized)) return null;

    const read = await this.repo.readDocument(repoRow.clonePath, normalized);
    if (read.kind === 'too_large') {
      // AC-34: never return the content of an oversized document.
      throw new AppError(
        'payload_too_large',
        `Document exceeds the maximum size of ${MAX_DOCUMENT_BYTES} bytes.`,
        413,
        { max_bytes: MAX_DOCUMENT_BYTES },
      );
    }
    if (read.kind !== 'ok') return null;
    const content = read.content;

    const model = await this.resolveModel(scope);
    const { tokens, estimated } = this.container.tokenizer.countFor(model, content);

    return {
      path: normalized,
      content,
      size: Buffer.byteLength(content, 'utf8'),
      source_folder: sourceFolderFor(normalized),
      tokens,
      tokens_estimated: estimated,
    };
  }

  /** Create or overwrite one document (AC-23, AC-24, AC-25, AC-26). Rejects
   *  before writing anything when the path is invalid — never a partial
   *  write. Save is write-to-working-tree ONLY — no git add/commit/push. */
  async save(workspaceId: string, repoId: string, path: string, content: string): Promise<SaveResult> {
    const repoRow = await this.repo.getRepoClone(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    if (!repoRow.clonePath) return { ok: false, reason: 'no_clone' };

    const normalized = normalizeRelativePath(path);
    if (!normalized || !isAllowedDocumentPath(normalized)) {
      return { ok: false, reason: 'invalid_path' };
    }

    // AC-33: byte size, not char count — checked before anything is written.
    if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) return { ok: false, reason: 'too_large' };

    const result = await this.repo.writeDocument(repoRow.clonePath, normalized, content);
    if (!result.ok) return { ok: false, reason: 'outside_clone' };

    // AC-27: the write-back reflects immediately on the next read, no manual
    // refresh needed — build the DTO from what we just wrote, not a re-scan.
    const { tokens, estimated } = this.container.tokenizer.countFor(null, content);
    return {
      ok: true,
      document: {
        path: normalized,
        content,
        size: Buffer.byteLength(content, 'utf8'),
        source_folder: sourceFolderFor(normalized),
        tokens,
        tokens_estimated: estimated,
      },
    };
  }

  // ---- attached sets — whole-set replace (AC-9, AC-10) ---------------------

  async getAgentDocuments(agentId: string): Promise<ProjectContextAttachment[]> {
    const rows = await this.repo.listAgentDocuments(agentId);
    return rows.slice().sort((a, b) => a.order - b.order);
  }

  async setAgentDocuments(agentId: string, paths: string[]): Promise<ProjectContextAttachment[]> {
    await this.repo.setAgentDocuments(agentId, this.validateAttachedPaths(paths));
    return this.getAgentDocuments(agentId);
  }

  async getSkillDocuments(skillId: string): Promise<ProjectContextAttachment[]> {
    const rows = await this.repo.listSkillDocuments(skillId);
    return rows.slice().sort((a, b) => a.order - b.order);
  }

  async setSkillDocuments(skillId: string, paths: string[]): Promise<ProjectContextAttachment[]> {
    await this.repo.setSkillDocuments(skillId, this.validateAttachedPaths(paths));
    return this.getSkillDocuments(skillId);
  }

  // ---- run-time resolution (AC-11..19) -------------------------------------

  /**
   * Resolve + inject an agent's attached documents for ONE run. Re-reads
   * storage fresh every call — nothing is cached on the agent row (AC-11).
   * `clonePath` null (no clone yet) ⇒ every attached path is reported
   * `missing`, same as an individually-missing path (AC-16).
   */
  async resolveForRun(clonePath: string | null, agentId: string, model: string): Promise<ResolvedRunContext> {
    const ownDocs = await this.repo.listAgentDocuments(agentId);
    const rawLinks = await this.repo.linkedSkillsRaw(agentId);

    const skillContributions: SkillContribution[] = [];
    for (const link of rawLinks) {
      const reachable =
        link.enabled &&
        !isScanBlocking(link.scanStatus as SkillScanStatus, link.scanFindings as SkillScanFinding[] | null);
      const documents = reachable ? await this.repo.listSkillDocuments(link.skillId) : [];
      skillContributions.push({ skillOrder: link.order, reachable, documents });
    }

    const orderedPaths = resolveAttachedPaths(ownDocs, skillContributions);
    if (orderedPaths.length === 0) return { texts: [], specsRead: [] };

    if (!clonePath) {
      return { texts: [], specsRead: orderedPaths.map((path) => ({ path, outcome: 'missing' as const })) };
    }

    const contents = new Map<string, string | null>();
    const tooLarge = new Set<string>();
    for (const path of orderedPaths) {
      const read = await this.repo.readDocument(clonePath, path);
      if (read.kind === 'too_large') tooLarge.add(path);
      contents.set(path, read.kind === 'ok' ? read.content : null);
    }

    const tokenizer = this.container.tokenizer;
    const result = buildSpecsRead(
      orderedPaths,
      contents,
      (text) => tokenizer.countFor(model, text).tokens,
      PROJECT_CONTEXT_TOKEN_BUDGET,
    );
    // AC-32: an oversized document was never read; it is reported with the
    // existing `dropped_for_budget` outcome rather than `missing`.
    const specsRead = result.specsRead.map((entry) =>
      tooLarge.has(entry.path) ? { path: entry.path, outcome: 'dropped_for_budget' as const } : entry,
    );
    return { texts: result.injectedTexts, specsRead };
  }

  // ---- internals ------------------------------------------------------------

  /**
   * Validate + normalize a whole-set-replace body (AC-9, AC-10) — the same
   * extension + allowlisted-segment shape check `save()` applies (AC-24),
   * here for ATTACH rather than write. SECURITY: paths were previously
   * persisted as-is with no validation, then read back via
   * `repository.readDocument` at run time — a path-traversal / arbitrary-
   * file-read vector (attach `"../../../secrets.json"`, and its content is
   * injected into the prompt and persisted into the run trace on the next
   * run). Rejects the WHOLE request when any path is invalid (fail closed,
   * matching routes.ts's `ValidationError` idiom for `save`) rather than
   * silently dropping bad entries, so the caller sees why nothing changed
   * instead of a path quietly vanishing.
   */
  private validateAttachedPaths(paths: string[]): string[] {
    const normalized: string[] = [];
    for (const raw of dedupePaths(paths)) {
      const path = normalizeRelativePath(raw);
      if (!path || !isAllowedDocumentPath(path)) {
        throw new ValidationError(`Invalid attached document path: "${raw}"`);
      }
      normalized.push(path);
    }
    return normalized;
  }

  private async resolveModel(scope: DocScope): Promise<string | null> {
    if (!scope.agentId) return null; // skill-scoped or unscoped: no single model to pick (Open question 2)
    return this.repo.getAgentModel(scope.agentId);
  }

  /** Raw usage context for coverage/used-by math (AC-21, AC-22) — every
   *  ENABLED agent's own + inherited (via an attached, enabled, non-scan-
   *  blocking skill) paths, and every ENABLED skill's own paths. */
  private async usageContext(
    workspaceId: string,
  ): Promise<{ agents: AgentUsageInput[]; skills: SkillUsageInput[] }> {
    const enabledAgentIds = await this.repo.enabledAgentIds(workspaceId);
    const enabledSkillIds = await this.repo.enabledSkillIds(workspaceId);

    const [agentDocs, skillDocs, links] = await Promise.all([
      this.repo.documentsForAgents(enabledAgentIds),
      this.repo.documentsForSkills(enabledSkillIds),
      this.repo.skillLinksForAgents(enabledAgentIds),
    ]);

    const ownByAgent = new Map<string, string[]>();
    for (const d of agentDocs) {
      const arr = ownByAgent.get(d.agentId) ?? [];
      arr.push(d.path);
      ownByAgent.set(d.agentId, arr);
    }

    const pathsBySkill = new Map<string, string[]>();
    for (const d of skillDocs) {
      const arr = pathsBySkill.get(d.skillId) ?? [];
      arr.push(d.path);
      pathsBySkill.set(d.skillId, arr);
    }

    const linksByAgent = new Map<string, typeof links>();
    for (const link of links) {
      const arr = linksByAgent.get(link.agentId) ?? [];
      arr.push(link);
      linksByAgent.set(link.agentId, arr);
    }

    const agents: AgentUsageInput[] = enabledAgentIds.map((agentId) => {
      const inherited: string[] = [];
      for (const link of linksByAgent.get(agentId) ?? []) {
        if (!link.enabled) continue;
        if (isScanBlocking(link.scanStatus as SkillScanStatus, link.scanFindings as SkillScanFinding[] | null)) {
          continue;
        }
        inherited.push(...(pathsBySkill.get(link.skillId) ?? []));
      }
      return { agentId, ownPaths: ownByAgent.get(agentId) ?? [], inheritedPaths: inherited };
    });

    const skills: SkillUsageInput[] = enabledSkillIds.map((skillId) => ({
      skillId,
      paths: pathsBySkill.get(skillId) ?? [],
    }));

    return { agents, skills };
  }
}
