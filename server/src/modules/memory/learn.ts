import { z } from 'zod';
import { MEMORY_CONTENT_MAX, MemoryKind, type LearnDraftResponse, type MemoryDraft } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { MemoryService, findingToSource } from './service.js';
import type { FindingSource } from './repository.js';
import { defaultDraftKind, draftDefaults, fallbackDraft, isValidGlob } from './helpers.js';
import { LEARN_DRAFT_SCHEMA_NAME, LEARN_DRAFT_TIMEOUT_MS } from './constants.js';
import { LEARN_DRAFT_SYSTEM_PROMPT } from './prompts.js';

/** What the model returns for a Learn draft (AC-3). */
const LlmDraft = z.object({
  content: z.string().min(1),
  kind: MemoryKind,
  path_glob: z.string(),
  confidence: z.number().min(0).max(1),
});

/**
 * Learn (finding → memory draft). Never persists anything (AC-6): the client
 * shows the draft in an editable modal and saves via POST /memories.
 */
export class LearnService extends MemoryService {
  constructor(container: Container) {
    super(container);
  }

  async draftFromFinding(workspaceId: string, userId: string, findingId: string): Promise<LearnDraftResponse> {
    const finding = await this.repo.findingSource(workspaceId, findingId);
    if (!finding) throw new NotFoundError('Finding not found');

    // Already learned → hand back the existing memory for editing (AC-7).
    if (finding.memoryId) {
      const m = await this.get(workspaceId, finding.memoryId);
      return {
        draft: {
          content: m.content,
          kind: m.kind,
          scope: m.scope === 'repo' ? 'repo' : 'global',
          repo_id: m.repo_id,
          path_globs: m.path_globs,
          links: m.links.map(({ target_kind, target_id }) => ({ target_kind, target_id })),
          applies_to_all_agents: m.applies_to_all_agents,
          confidence: m.confidence,
          fallback: false,
        },
        source: m.sources[0] ?? findingToSource(finding, userId),
        similar: [],
        existing_memory_id: m.id,
      };
    }

    const agentExists = finding.agentId
      ? (await this.repo.agentIdsIn(workspaceId, [finding.agentId])).has(finding.agentId)
      : false;
    const draft = await this.llmDraft(workspaceId, finding, agentExists).catch(() =>
      fallbackDraft(finding, { agentExists }),
    );
    const similar = await this.similar(workspaceId, draft.content, finding.repoId);
    return { draft, source: findingToSource(finding, userId), similar, existing_memory_id: null };
  }

  private async llmDraft(workspaceId: string, f: FindingSource, agentExists: boolean): Promise<MemoryDraft> {
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'memory');
    const llm = await this.container.llm(provider);
    const decision = f.dismissedAt ? 'dismissed' : f.acceptedAt ? 'accepted' : 'undecided';
    const findingText = [
      `Title: ${f.title}`,
      `Severity: ${f.severity}`,
      `Category: ${f.category}`,
      `File: ${f.file}`,
      `Rationale: ${f.rationale}`,
      f.suggestion ? `Suggested fix: ${f.suggestion}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const user = [
      `Reviewer decision: ${decision}`,
      `Suggested default kind: ${defaultDraftKind(f)}`,
      `## Pull request title\n${wrapUntrusted('pr-title', f.prTitle)}`,
      `## Finding\n${wrapUntrusted('finding', findingText)}`,
    ].join('\n\n');

    const call = llm.completeStructured({
      model,
      schema: LlmDraft,
      schemaName: LEARN_DRAFT_SCHEMA_NAME,
      messages: [
        { role: 'system', content: LEARN_DRAFT_SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('learn draft timed out')), LEARN_DRAFT_TIMEOUT_MS);
    });
    const result = await Promise.race([call, timeout]).finally(() => clearTimeout(timer));

    const glob = result.data.path_glob.trim();
    return {
      content: result.data.content.trim().slice(0, MEMORY_CONTENT_MAX),
      kind: result.data.kind,
      path_globs: glob && isValidGlob(glob) ? [glob] : [],
      confidence: result.data.confidence,
      ...draftDefaults(f, { agentExists }),
      fallback: false,
    };
  }
}
