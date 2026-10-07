import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { Container } from '../../platform/container.js';
import type {
  CatalogTestResult,
  CommunityCatalogListing,
  CommunitySkill,
  Skill,
  SkillScanFinding,
  SkillScanStatus,
  SkillType,
} from '@devdigest/shared';
import { SkillScanFinding as SkillScanFindingSchema } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import * as t from '../../db/schema.js';
import { SkillsRepository } from './repository.js';
import {
  computeSkillStats,
  computeSkillUsageSummaries,
  isScanBlocking,
  nameFromMarkdown,
  parseCatalogRepoValue,
  qualifyingLanguageSlugs,
  toSkillDto,
  toSkillVersionListItem,
  type SkillStats,
  type SkillUsageSummary,
  type SkillVersionListItem,
} from './helpers.js';
import { parseCatalogEntry, selectCatalogEntryPaths, type ParsedCatalogEntry } from './catalog.js';
import {
  CATALOG_CACHE_TTL_MS,
  IMPORT_URL_MAX_BYTES,
  IMPORT_URL_TIMEOUT_MS,
  SKILL_SCAN_SCHEMA_NAME,
} from './constants.js';
import { SKILL_SCAN_SYSTEM_PROMPT } from './prompts.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';

/**
 * A1 — skills service. Business logic for the Skills Lab page + the Add Skill
 * drawer's URL/Community tabs. File import needs no server call — the client
 * reads the File via `File.text()` and hits plain `create`.
 *
 * Every skill body is content-scanned (see `scanBody`) regardless of
 * `source` — a compromised account or a copy-pasted body from an untrusted
 * blog is just as much a supply-chain risk as an imported URL. A scan that
 * finds a critical/high finding hard-blocks enabling the skill (fail-closed
 * on scan errors too); see `helpers.ts`'s `isScanBlocking`.
 */

const SkillScanResponse = z.object({ findings: z.array(SkillScanFindingSchema) });

export type SkillListItem = Skill & { usage: SkillUsageSummary };

export interface CreateSkillInput {
  name?: string;
  description?: string;
  type: SkillType;
  body: string;
  source?: 'manual' | 'imported_url' | 'extracted' | 'community';
  enabled?: boolean;
  /** Project scope (SPEC-07 S-AC-23) — absent/undefined ⇒ global. */
  repoId?: string;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  override?: boolean;
  /** Project scope reassignment (2026-10-02 amendment). `undefined` ⇒ not
   *  touched; `null` ⇒ cleared to global; a string ⇒ reassigned to that repo
   *  (validated against the caller's workspace, AC-42). Any skill, any
   *  direction, including community skills back to global (AC-41/AC-43). */
  repoId?: string | null;
}

export class SkillsService {
  private repo: SkillsRepository;
  /** In-memory catalog listing cache, keyed by resolved `owner/name` (SPEC-07
   *  S-AC-6). `SkillsService` MUST be a single shared instance per process —
   *  obtained via `container.skillsService` (memoized getter, see
   *  `platform/container.ts`), never `new SkillsService(container)` at a
   *  per-request call site, or this cache resets empty on every call and the
   *  TTL window is silently bypassed (see architecture-review fix history). */
  private catalogCache = new Map<string, { entries: ParsedCatalogEntry[]; fetchedAt: number }>();

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  /** True iff `repoId` names a repo belonging to `workspaceId` (AC-21,
   *  AC-38, AC-42 — the same ownership check at import, listing-filter, and
   *  reassignment time). */
  private async repoBelongsToWorkspace(workspaceId: string, repoId: string): Promise<boolean> {
    const [repoRow] = await this.container.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return !!repoRow;
  }

  /**
   * List a workspace's skills, optionally narrowed to one project's working
   * set (2026-10-02 amendment). `repoFilter`:
   *  - `undefined` ⇒ every skill in the workspace, unchanged default (AC-36)
   *    — what the Agent editor's skill picker always gets (AC-40), since it
   *    calls this with no filter.
   *  - the reserved literal `'none'` ⇒ global-only (AC-37).
   *  - a repo id ⇒ that project's skills plus every global skill (AC-35),
   *    rejected if the id doesn't belong to this workspace (AC-38).
   */
  async list(workspaceId: string, repoFilter?: string): Promise<SkillListItem[]> {
    let repoIdFilter: string | null | undefined;
    if (repoFilter === undefined) {
      repoIdFilter = undefined;
    } else if (repoFilter === 'none') {
      repoIdFilter = null;
    } else {
      if (!(await this.repoBelongsToWorkspace(workspaceId, repoFilter))) {
        throw new ValidationError('repo_id does not belong to this workspace');
      }
      repoIdFilter = repoFilter;
    }

    const rows = await this.repo.list(workspaceId, repoIdFilter);
    const skillIds = rows.map((r) => r.id);

    const links = await this.repo.agentSkillLinksForWorkspace(workspaceId);
    const agentIds = [...new Set(links.map((l) => l.agentId))];
    const [runs, findingRows] = await Promise.all([
      this.repo.runsForAgents(workspaceId, agentIds),
      this.repo.findingOutcomesForAgents(workspaceId, agentIds),
    ]);
    const usageBySkill = computeSkillUsageSummaries(skillIds, links, runs, findingRows);

    return rows.map((row) => ({
      ...toSkillDto(row),
      usage: usageBySkill.get(row.id) ?? { used_by_agents: 0, pull_frequency: null, accept_rate: null },
    }));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    // The skill row and its eval cases (owned by the eval module) go in one transaction.
    return this.container.db.transaction(async (tx) => {
      const deleted = await this.repo.deleteById(workspaceId, id, tx);
      if (!deleted) return false;
      await this.container.evalRepo.deleteCasesForOwner(workspaceId, 'skill', id, tx);
      return true;
    });
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    // AC-49: a supplied repo_id must belong to the caller's workspace — same
    // check and message as update/import. Runs before the scan so nothing is
    // persisted on rejection.
    if (input.repoId && !(await this.repoBelongsToWorkspace(workspaceId, input.repoId))) {
      throw new ValidationError('repo_id does not belong to this workspace');
    }
    const name = input.name?.trim() || nameFromMarkdown(input.body, 'Untitled skill');
    const scan = await this.scanBody(workspaceId, input.body);
    const enabled = isScanBlocking(scan.status, scan.findings) ? false : input.enabled;
    const row = await this.repo.insert({
      workspaceId,
      name,
      description: input.description ?? '',
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      enabled,
      scanStatus: scan.status,
      scanFindings: scan.findings,
      scannedAt: new Date(),
      repoId: input.repoId ?? null,
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;

    let scanPatch: { scanStatus?: SkillScanStatus; scanFindings?: SkillScanFinding[]; scannedAt?: Date } = {};
    if (patch.body !== undefined && patch.body !== existing.body) {
      const scan = await this.scanBody(workspaceId, patch.body);
      scanPatch = { scanStatus: scan.status, scanFindings: scan.findings, scannedAt: new Date() };
    }

    if (patch.enabled === true) {
      const status = scanPatch.scanStatus ?? (existing.scanStatus as SkillScanStatus);
      const findings = (scanPatch.scanFindings ?? (existing.scanFindings as SkillScanFinding[] | null)) ?? [];
      if (isScanBlocking(status, findings) && !patch.override) {
        throw new ValidationError(
          `Cannot enable "${existing.name}" — content scan ${
            status === 'flagged'
              ? `found ${findings.length} issue(s): ${findings.map((f) => `[${f.severity}] ${f.category}`).join(', ')}`
              : `is ${status}`
          }.`,
        );
      }
    }

    // 2026-10-02 amendment — project scope reassignment (AC-41/AC-43). Any
    // skill, any direction, including back to global; validated against the
    // caller's workspace when reassigning to a real repo (AC-42). Deliberately
    // NOT folded into scanPatch/version handling above — a scope-only change
    // must bump no version, write no skill_versions row, and trigger no
    // re-scan (AC-44), which already falls out naturally here since `repoId`
    // never participates in `isBodyChange`.
    if (patch.repoId !== undefined && patch.repoId !== null) {
      if (!(await this.repoBelongsToWorkspace(workspaceId, patch.repoId))) {
        throw new ValidationError('repo_id does not belong to this workspace');
      }
    }

    const row = await this.repo.update(workspaceId, id, {
      name: patch.name,
      description: patch.description,
      type: patch.type,
      body: patch.body,
      enabled: patch.enabled,
      repoId: patch.repoId,
      ...scanPatch,
    });
    return row ? toSkillDto(row) : undefined;
  }

  /** Manual re-scan (Skill Editor "Re-scan" action, or after the scanner's
   *  ruleset changes) — re-runs the content scan against the CURRENT body
   *  without touching any other field. */
  async scanSkill(workspaceId: string, id: string): Promise<Skill> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) throw new NotFoundError('Skill not found');
    const scan = await this.scanBody(workspaceId, existing.body);
    const row = await this.repo.update(workspaceId, id, {
      scanStatus: scan.status,
      scanFindings: scan.findings,
      scannedAt: new Date(),
    });
    return toSkillDto(row!);
  }

  /**
   * LLM-based semantic scan for prompt-injection / malicious content in a
   * skill body (LLM01/LLM03 — see the skills-scan spec). The body is
   * delimiter-wrapped as untrusted data, same convention `assemblePrompt`
   * uses for the diff/PR description, so the scanner itself can't be
   * hijacked by the very content it's classifying. Fails CLOSED: any error
   * (bad provider config, timeout, malformed structured output after
   * retries) is reported as `scan_status: 'error'`, which `isScanBlocking`
   * treats the same as a critical finding — never fail-open.
   */
  private async scanBody(
    workspaceId: string,
    body: string,
  ): Promise<{ status: SkillScanStatus; findings: SkillScanFinding[] }> {
    try {
      const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'skill_scan');
      const llm = await this.container.llm(provider);
      const result = await llm.completeStructured({
        model,
        schema: SkillScanResponse,
        schemaName: SKILL_SCAN_SCHEMA_NAME,
        messages: [
          { role: 'system', content: SKILL_SCAN_SYSTEM_PROMPT },
          { role: 'user', content: wrapUntrusted('skill-body', body) },
        ],
      });
      const findings = result.data.findings;
      return { status: findings.length > 0 ? 'flagged' : 'clean', findings };
    } catch {
      return { status: 'error', findings: [] };
    }
  }

  /** Version history for the Versions tab, newest first. */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersionListItem[]> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) throw new NotFoundError('Skill not found');
    const rows = await this.repo.listVersions(id);
    return rows.map((r) => toSkillVersionListItem(r, skill.version));
  }

  /** Restore a past version's body as a new version (git-revert style — the
   *  existing `update()` body-change path already bumps + snapshots). */
  async restoreVersion(workspaceId: string, id: string, version: number): Promise<Skill> {
    const rows = await this.repo.listVersions(id);
    const target = rows.find((r) => r.version === version);
    if (!target) throw new NotFoundError('Skill version not found');
    const row = await this.repo.update(workspaceId, id, { body: target.body });
    if (!row) throw new NotFoundError('Skill not found');
    return toSkillDto(row);
  }

  /** Stats tab aggregate — see `computeSkillStats`'s doc comment for the
   *  approximation this relies on (attribution via agents using the skill). */
  async stats(workspaceId: string, id: string): Promise<SkillStats> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) throw new NotFoundError('Skill not found');
    const agents = await this.container.agentsRepo.agentsForSkill(workspaceId, id);
    const agentIds = agents.map((a) => a.id);
    const [runs, findingRows] = await Promise.all([
      this.repo.runsForAgents(workspaceId, agentIds),
      this.repo.findingOutcomesForAgents(workspaceId, agentIds),
    ]);
    return computeSkillStats(agents, runs, findingRows);
  }

  /**
   * Fetch a skill body from a URL, server-side (avoids browser CORS and keeps
   * the fetch logged/controlled here). Stored disabled — an imported_url skill
   * is untrusted until a human reads and enables it. Bounded by a timeout and
   * a byte cap so a slow/huge response can't hang or bloat the request.
   */
  async importFromUrl(workspaceId: string, url: string): Promise<Skill> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ValidationError('Invalid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ValidationError('Only http(s) URLs are supported');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMPORT_URL_TIMEOUT_MS);
    let body: string;
    try {
      const res = await fetch(parsed, { signal: controller.signal });
      if (!res.ok) throw new ExternalServiceError(`Fetch failed: HTTP ${res.status}`);
      const text = await res.text();
      body = text.length > IMPORT_URL_MAX_BYTES ? text.slice(0, IMPORT_URL_MAX_BYTES) : text;
    } catch (err) {
      if (err instanceof ExternalServiceError) throw err;
      throw new ExternalServiceError(`Could not fetch URL: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }

    const fallbackName = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
    const scan = await this.scanBody(workspaceId, body);
    const row = await this.repo.insert({
      workspaceId,
      name: nameFromMarkdown(body, fallbackName),
      description: `Imported from ${parsed.hostname}`,
      type: 'custom',
      source: 'imported_url',
      body,
      enabled: false,
      scanStatus: scan.status,
      scanFindings: scan.findings,
      scannedAt: new Date(),
    });
    return toSkillDto(row);
  }

  // ---- Community catalog (SPEC-07) ----------------------------------------
  // Replaces the old fixture catalog: a live listing read from a configured
  // GitHub repository via `container.catalogSource` (unauthenticated — see
  // that port's doc comment), cached for CATALOG_CACHE_TTL_MS, search/tag
  // filtered in-process over the cached payload. Never throws out to the
  // caller — an unreachable/misconfigured catalog resolves to
  // `{ available: false, message }` (S-AC-31), never a fixture/placeholder
  // fallback.

  /** The effective catalog repo value for a workspace: the stored
   *  `community_catalog_repo` override, else the env default (S-AC-1/S-AC-2). */
  private async resolveCatalogRepoValue(workspaceId: string): Promise<string> {
    const rows = await this.container.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    const override = rows.find((r) => r.key === 'community_catalog_repo')?.value;
    const trimmed = typeof override === 'string' ? override.trim() : '';
    return trimmed.length > 0 ? trimmed : this.container.config.communityCatalogRepoDefault;
  }

  /**
   * Fetch (or reuse the cached) full catalog listing for an already-resolved
   * repo value. One tree request per cache-miss/refresh (S-AC-5's one-tree-
   * request budget governs the TREE read itself); building each entry's
   * real name/description/tags/type additionally fetches that entry's body
   * once per cache population (not per visitor — gated by the same TTL), to
   * satisfy S-AC-8's requirement that the listing carry real metadata, not
   * folder-only placeholders. See this task's Implementation Report
   * ("Deviations from plan") for the tension this resolves between S-AC-5's
   * literal "no entry body" wording and S-AC-8/S-AC-11–14's requirement that
   * the listing carry frontmatter-derived data.
   */
  private async loadCatalog(
    repoValue: string,
    opts: { forceRefresh?: boolean } = {},
  ): Promise<{ available: boolean; message?: string; entries: ParsedCatalogEntry[] }> {
    const resolved = parseCatalogRepoValue(repoValue);
    if (!resolved) {
      return {
        available: false,
        message: `Catalog "${repoValue}" is not a valid github.com repository (expected "owner/name").`,
        entries: [],
      };
    }

    if (opts.forceRefresh) this.catalogCache.delete(resolved.fullName);
    const cached = this.catalogCache.get(resolved.fullName);
    if (cached && Date.now() - cached.fetchedAt < CATALOG_CACHE_TTL_MS) {
      return { available: true, entries: cached.entries };
    }

    try {
      const repoRef = { owner: resolved.owner, name: resolved.name };
      const tree = await this.container.catalogSource.listTree(repoRef);
      const candidates = selectCatalogEntryPaths(tree);
      const entries = await Promise.all(
        candidates.map(async ({ path, folder }) => {
          const body = await this.container.catalogSource.fetchBody(repoRef, path);
          return parseCatalogEntry(path, folder, body);
        }),
      );
      this.catalogCache.set(resolved.fullName, { entries, fetchedAt: Date.now() });
      return { available: true, entries };
    } catch (err) {
      return {
        available: false,
        message: `Could not reach catalog "${resolved.fullName}": ${(err as Error).message}`,
        entries: [],
      };
    }
  }

  private toCommunitySkill(e: ParsedCatalogEntry): CommunitySkill {
    return { path: e.path, folder: e.folder, name: e.name, description: e.description, tags: e.tags, type: e.type };
  }

  /** `GET /skills/community` — case-insensitive name/description search
   *  (S-AC-15) and exact tag-slug filter (S-AC-16) over the cached listing.
   *  `forceRefresh` backs the explicit refresh action (S-AC-7). */
  async communityCatalogListing(
    workspaceId: string,
    opts: { query?: string; tag?: string; forceRefresh?: boolean } = {},
  ): Promise<CommunityCatalogListing> {
    const repoValue = await this.resolveCatalogRepoValue(workspaceId);
    const { available, message, entries } = await this.loadCatalog(repoValue, {
      forceRefresh: opts.forceRefresh,
    });
    if (!available) return { available: false, message, entries: [] };

    const q = opts.query?.trim().toLowerCase();
    const tag = opts.tag?.trim();
    const filtered = entries.filter((e) => {
      const matchesQuery =
        !q || e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
      const matchesTag = !tag || e.tags.includes(tag);
      return matchesQuery && matchesTag;
    });
    return { available: true, entries: filtered.map((e) => this.toCommunitySkill(e)) };
  }

  /**
   * Import a catalog entry by its repo-relative path (S-AC-17), fetching
   * exactly that entry's body (S-AC-18/S-AC-19) and persisting it disabled,
   * content-scanned, tagged, and scoped to the required project. Nothing is
   * persisted on any rejection (S-AC-20 – S-AC-22).
   */
  async importCommunitySkill(workspaceId: string, path: string, repoId: string): Promise<Skill> {
    if (!repoId) throw new ValidationError('repo_id is required to import a community skill');

    // S-AC-21: repo_id must belong to the caller's workspace.
    if (!(await this.repoBelongsToWorkspace(workspaceId, repoId))) {
      throw new ValidationError('repo_id does not belong to this workspace');
    }

    const repoValue = await this.resolveCatalogRepoValue(workspaceId);
    const { available, entries } = await this.loadCatalog(repoValue);
    if (!available) throw new ExternalServiceError('Community catalog is currently unavailable');
    const entry = entries.find((e) => e.path === path);
    if (!entry) throw new NotFoundError('Community skill not found in the current catalog listing');

    const resolved = parseCatalogRepoValue(repoValue)!;
    const body = await this.container.catalogSource.fetchBody(
      { owner: resolved.owner, name: resolved.name },
      path,
    );
    const scan = await this.scanBody(workspaceId, body);
    const row = await this.repo.insert({
      workspaceId,
      name: entry.name,
      description: entry.description,
      type: entry.type,
      source: 'community',
      body,
      enabled: false,
      scanStatus: scan.status,
      scanFindings: scan.findings,
      scannedAt: new Date(),
      repoId,
      tags: entry.tags,
      sourcePath: path,
    });
    return toSkillDto(row);
  }

  /** Settings → Catalog "Test" action. Resolves the catalog (an explicit
   *  `repoOverride` tests an unsaved edit without persisting it — client
   *  spec C-AC-34), attempts a fresh listing, and returns folder/entry
   *  counts on success or the failure reason on error. Never touches the
   *  stored setting. */
  async testCatalogConnection(workspaceId: string, repoOverride?: string): Promise<CatalogTestResult> {
    const repoValue = repoOverride?.trim() ? repoOverride.trim() : await this.resolveCatalogRepoValue(workspaceId);
    const { available, message, entries } = await this.loadCatalog(repoValue, { forceRefresh: true });
    if (!available) return { ok: false, message: message ?? 'Catalog is unavailable' };
    const folders = new Set(entries.map((e) => e.folder)).size;
    return { ok: true, message: `${folders} folder(s), ${entries.length} skill(s)` };
  }

  /**
   * `GET /repos/:id/skill-suggestions` — catalog entries whose tags overlap
   * the project's qualifying languages (S-AC-26/S-AC-27/S-AC-29), excluding
   * entries already imported into that project (S-AC-28) and tolerating a
   * null language breakdown (S-AC-30) or an unavailable catalog (S-AC-32,
   * returned as an empty list + the availability indicator, never an error).
   */
  async suggestionsForRepo(
    workspaceId: string,
    repoId: string,
    languages: Record<string, number> | null,
  ): Promise<CommunityCatalogListing> {
    const qualifying = qualifyingLanguageSlugs(languages);
    if (qualifying.length === 0) return { available: true, entries: [] };

    const repoValue = await this.resolveCatalogRepoValue(workspaceId);
    const { available, message, entries } = await this.loadCatalog(repoValue);
    if (!available) return { available: false, message, entries: [] };

    const importedPaths = await this.repo.communitySkillSourcePathsForRepo(workspaceId, repoId);
    const isImported = (e: ParsedCatalogEntry) => importedPaths.includes(e.path);

    const matched = entries.filter(
      (e) => e.tags.some((tag) => qualifying.includes(tag)) && !isImported(e),
    );
    return { available: true, entries: matched.map((e) => this.toCommunitySkill(e)) };
  }
}
