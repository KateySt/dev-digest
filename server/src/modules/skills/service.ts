import type { Container } from '../../platform/container.js';
import type { CommunitySkill, Skill, SkillType } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto, nameFromMarkdown } from './helpers.js';
import { COMMUNITY_SKILLS, IMPORT_URL_MAX_BYTES, IMPORT_URL_TIMEOUT_MS } from './constants.js';
import { ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';

/**
 * A1 — skills service. Business logic for the Skills Lab page + the Add Skill
 * drawer's URL/Community tabs. File import needs no server call — the client
 * reads the File via `File.text()` and hits plain `create`.
 */

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
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
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
    const row = await this.repo.insert({
      workspaceId,
      name,
      description: input.description ?? '',
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      enabled: input.enabled,
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
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
    const row = await this.repo.insert({
      workspaceId,
      name: nameFromMarkdown(body, fallbackName),
      description: `Imported from ${parsed.hostname}`,
      type: 'custom',
      source: 'imported_url',
      body,
      enabled: false,
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
    const row = await this.repo.insert({
      workspaceId,
      name: fixture.name,
      description: fixture.desc,
      type: 'custom',
      source: 'community',
      body: fixture.body,
      enabled: false,
    });
    return toSkillDto(row);
  }
}
