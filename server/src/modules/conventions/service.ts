import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  ConventionCategory,
  type ConventionCandidate,
  type ConventionStatus,
  type CreateSkillFromConventionsInput,
  type CreateSkillFromConventionsResult,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository } from './repository.js';
import {
  CODE_SAMPLE_FILE_COUNT,
  CONFIG_FILE_CANDIDATES,
  EXTRACTION_SCHEMA_NAME,
  MAX_CANDIDATES,
  MAX_FILE_CHARS,
} from './constants.js';
import { clampEvidenceLine, evidenceExistsInSource, toConventionDto, unavailableIds } from './helpers.js';
import { EXTRACTION_SYSTEM_PROMPT } from './prompts.js';

/**
 * Conventions Extractor. File selection is entirely code-driven (no model
 * call): well-known lint/format/compiler configs, read verbatim, plus the
 * top-N ranked code files from `repoIntel.getConventionSamples()`. Only the
 * ANALYSIS step calls a (cheap) model — see `resolveFeatureModel(..,
 * 'conventions')`. Every candidate the model returns is then checked in code
 * against the actual sampled file content; candidates whose evidence doesn't
 * really exist are discarded before they ever reach the DB.
 */

const LLMCandidate = z.object({
  category: ConventionCategory,
  rule: z.string().min(1),
  rationale: z.string().min(1).optional(),
  evidence_path: z.string().min(1),
  evidence_snippet: z.string().min(1),
  evidence_line: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1),
});

const ExtractionResponse = z.object({
  candidates: z.array(LLMCandidate).max(MAX_CANDIDATES),
});

interface Sample {
  path: string;
  content: string;
}

export class ConventionsService {
  private repo: ConventionsRepository;
  private repos: RepoRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.repos = new RepoRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.list(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  async setStatus(workspaceId: string, id: string, status: ConventionStatus): Promise<ConventionCandidate> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) throw new NotFoundError('Convention candidate not found');
    // AC-9: a convention used in a skill stays accepted until it is unlinked.
    if (existing.skillId !== null && status !== 'accepted') {
      throw new ConflictError(
        'Convention is used in a skill; unlink it first',
        { skill_id: existing.skillId },
        'convention_in_use',
      );
    }
    await this.repo.setStatus(workspaceId, id, status);
    return this.get(workspaceId, id);
  }

  async updateRule(workspaceId: string, id: string, rule: string): Promise<ConventionCandidate> {
    const row = await this.repo.updateRule(workspaceId, id, rule.trim());
    if (!row) throw new NotFoundError('Convention candidate not found');
    return this.get(workspaceId, id);
  }

  /** AC-8: detach a convention from its skill → back to "ready". */
  async unlink(workspaceId: string, id: string): Promise<ConventionCandidate> {
    if (!(await this.repo.unlink(workspaceId, id))) throw new NotFoundError('Convention candidate not found');
    return this.get(workspaceId, id);
  }

  /**
   * Create one skill from a selection of accepted, unused conventions and link
   * them to it (SPEC-2026-10-16-convention-skills AC-2…AC-7).
   *
   * Order matters: an unlocked pre-check fails fast; the skill scan (an LLM
   * call) runs next, OUTSIDE any transaction; only then one short transaction
   * locks the rows, re-checks them (a concurrent request may have taken them
   * meanwhile — AC-6), inserts the skill and links the conventions.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateSkillFromConventionsInput,
  ): Promise<CreateSkillFromConventionsResult> {
    const ids = input.convention_ids;
    this.assertAvailable(await this.repo.getManyForSkill(workspaceId, ids), ids, repoId);

    const skills = this.container.skillsService;
    const prepared = await skills.prepareCreate(workspaceId, {
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      enabled: input.enabled,
      source: 'extracted',
      repoId: input.scope === 'repo' ? repoId : undefined,
    });

    const skill = await this.container.db.transaction(async (tx) => {
      this.assertAvailable(await this.repo.getManyForSkill(workspaceId, ids, tx, true), ids, repoId);
      const created = await skills.insertPrepared(prepared, tx);
      await this.repo.linkToSkill(ids, created.id, tx);
      return created;
    });

    return { skill, conventions: await this.list(workspaceId, repoId) };
  }

  private assertAvailable(
    rows: Parameters<typeof unavailableIds>[0],
    ids: string[],
    repoId: string,
  ): void {
    const { missing, unavailable } = unavailableIds(rows, ids, repoId);
    if (missing.length > 0) throw new NotFoundError('Convention candidate not found');
    if (unavailable.length > 0) {
      throw new ConflictError(
        'Some conventions are not accepted or are already used in a skill',
        { ids: unavailable },
        'convention_unavailable',
      );
    }
  }

  private async get(workspaceId: string, id: string): Promise<ConventionCandidate> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) throw new NotFoundError('Convention candidate not found');
    return toConventionDto(row);
  }

  /**
   * (Re-)scan a repo for convention candidates. Re-scanning replaces every
   * NOT-accepted candidate (pending or rejected); previously accepted ones
   * are left alone.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    if (!repo.clonePath) throw new NotFoundError('Repo has not been cloned yet');

    const samples = await this.gatherSamples(repo.clonePath, repoId);
    if (samples.length === 0) return this.list(workspaceId, repoId);

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(provider);

    const sampleBlock = samples
      .map((s) => `### ${s.path}\n\`\`\`\n${numberLines(s.content)}\n\`\`\``)
      .join('\n\n');

    const result = await llm.completeStructured({
      model,
      schema: ExtractionResponse,
      schemaName: EXTRACTION_SCHEMA_NAME,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: `## Sampled files\n\n${sampleBlock}` },
      ],
    });

    const sourceByPath = new Map(samples.map((s) => [s.path, s.content]));
    const verified = result.data.candidates.filter((c) => {
      const source = sourceByPath.get(c.evidence_path);
      return source != null && evidenceExistsInSource(source, c.evidence_snippet);
    });

    await this.repo.deleteNotAccepted(workspaceId, repoId);
    await this.repo.insertMany(
      verified.map((c) => {
        const source = sourceByPath.get(c.evidence_path)!;
        return {
          workspaceId,
          repoId,
          category: c.category,
          rule: c.rule,
          rationale: c.rationale ?? null,
          evidencePath: c.evidence_path,
          evidenceSnippet: c.evidence_snippet,
          evidenceLine: clampEvidenceLine(source, c.evidence_line),
          confidence: c.confidence,
        };
      }),
    );
    return this.list(workspaceId, repoId);
  }

  /** Config files (verbatim, no ranking) + top-N ranked code files. Missing
   *  files (a repo without eslint, say) are silently skipped. */
  private async gatherSamples(clonePath: string, repoId: string): Promise<Sample[]> {
    const codePaths = await this.container.repoIntel.getConventionSamples(repoId, CODE_SAMPLE_FILE_COUNT);
    const paths = [...CONFIG_FILE_CANDIDATES, ...codePaths];

    const samples: Sample[] = [];
    for (const path of paths) {
      const content = await readFile(join(clonePath, path), 'utf8').catch(() => null);
      if (content == null) continue;
      samples.push({
        path,
        content: content.length > MAX_FILE_CHARS ? content.slice(0, MAX_FILE_CHARS) : content,
      });
    }
    return samples;
  }
}

/** Prefix each line with its 1-based line number, so the model can cite an
 *  `evidence_line` we can later sanity-check against the file's line count. */
function numberLines(content: string): string {
  return content
    .split('\n')
    .map((line, i) => `${i + 1}| ${line}`)
    .join('\n');
}
