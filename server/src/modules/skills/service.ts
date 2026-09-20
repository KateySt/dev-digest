import { z } from 'zod';
import type { Container } from '../../platform/container.js';
import type {
  CommunitySkill,
  Skill,
  SkillScanFinding,
  SkillScanStatus,
  SkillType,
} from '@devdigest/shared';
import { SkillScanFinding as SkillScanFindingSchema } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { SkillsRepository } from './repository.js';
import {
  computeSkillStats,
  computeSkillUsageSummaries,
  isScanBlocking,
  nameFromMarkdown,
  toSkillDto,
  toSkillVersionListItem,
  type SkillStats,
  type SkillUsageSummary,
  type SkillVersionListItem,
} from './helpers.js';
import {
  COMMUNITY_SKILLS,
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
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  override?: boolean;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<SkillListItem[]> {
    const rows = await this.repo.list(workspaceId);
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
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
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

    const row = await this.repo.update(workspaceId, id, {
      name: patch.name,
      description: patch.description,
      type: patch.type,
      body: patch.body,
      enabled: patch.enabled,
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

  /** Search the fixture community catalog (no live external index in this repo). */
  searchCommunity(query?: string, lang?: string): CommunitySkill[] {
    const q = query?.trim().toLowerCase();
    return COMMUNITY_SKILLS.filter((s) => {
      const matchesQuery =
        !q || s.name.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q);
      const matchesLang = !lang || s.lang === lang;
      return matchesQuery && matchesLang;
    }).map(({ body: _body, ...rest }) => rest);
  }

  /** Import a fixture community skill by name. Stored disabled until vetted. */
  async importCommunity(workspaceId: string, name: string): Promise<Skill> {
    const fixture = COMMUNITY_SKILLS.find((s) => s.name === name);
    if (!fixture) throw new NotFoundError('Community skill not found');
    const scan = await this.scanBody(workspaceId, fixture.body);
    const row = await this.repo.insert({
      workspaceId,
      name: fixture.name,
      description: fixture.desc,
      type: 'custom',
      source: 'community',
      body: fixture.body,
      enabled: false,
      scanStatus: scan.status,
      scanFindings: scan.findings,
      scannedAt: new Date(),
    });
    return toSkillDto(row);
  }
}
