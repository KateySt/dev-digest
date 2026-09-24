import { z } from 'zod';
import type { Risk, Risks } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { RunLogger } from '../../platform/run-logger.js';
import type { PullRow } from '../../db/rows.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { RisksRepository } from './repository.js';
import { RISKS_SCHEMA_NAME } from './constants.js';
import { renderDiffBlocks } from './helpers.js';
import { RISKS_SYSTEM_PROMPT } from './prompts.js';

/**
 * RisksService — derives a PR's merge-risk brief with a separate (cheap)
 * model, per-PR, cached by head sha. Mirrors `IntentService`'s cache-check
 * shape; the "risk_brief" feature model id already existed in Settings
 * (`FEATURE_MODELS`) before this module did, unused until now.
 */

const RiskModel = z.object({
  kind: z.string().min(1),
  title: z.string().min(1),
  explanation: z.string().min(1),
  severity: z.enum(['high', 'medium', 'low']),
  file_refs: z.array(z.string()),
});
const RisksModelResponse = z.object({ risks: z.array(RiskModel) });

export class RisksService {
  private repo: RisksRepository;
  private reviews: ReviewRepository;

  constructor(private container: Container) {
    this.repo = new RisksRepository(container.db);
    this.reviews = container.reviewRepo;
  }

  /** Load the persisted slice → public `Risks`, or `undefined` if never computed. */
  async get(prId: string): Promise<Risks | undefined> {
    const slice = await this.repo.getSlice(prId);
    return slice ? { risks: slice.risks } : undefined;
  }

  /** Same cache-freshness contract as `IntentService.getOrCompute`: a cache
   *  hit (row's head_sha matches the PR's current head) skips the model call.
   *  `force` (default falsy) bypasses that freshness check and always
   *  re-derives — used by the PR Brief's manual refresh action; a forced
   *  refresh on a binary-only diff still short-circuits to an empty brief
   *  before any model call (see below). */
  async getOrCompute(workspaceId: string, pull: PullRow, runLog?: RunLogger, force?: boolean): Promise<Risks> {
    const existing = await this.repo.getSlice(pull.id);
    if (!force && existing && existing.headSha === pull.headSha) {
      runLog?.info('Risk brief cache hit — head_sha unchanged, reusing persisted risks (no model call)');
      return { risks: existing.risks };
    }
    if (force) {
      runLog?.info('Risk brief force-refresh requested — bypassing cache, deriving via model');
    } else {
      runLog?.info('Risk brief cache miss — head_sha changed or no prior risk brief, deriving via model');
    }

    const files = await this.reviews.getPrFiles(pull.id);
    const diffBlocks = renderDiffBlocks(files);

    // No diff content to ground a risk in (e.g. binary-only diff) — persist an
    // empty, fresh brief rather than calling the model on nothing.
    if (!diffBlocks.trim()) {
      const risks: Risk[] = [];
      await this.repo.upsertSlice(pull.id, {
        risks,
        headSha: pull.headSha,
        provider: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
      });
      return { risks };
    }

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
    const llm = await this.container.llm(provider);

    const userMessage = `## PR title\n<untrusted>\n${pull.title}\n</untrusted>\n\n## Changed files (diff)\n<untrusted>\n${diffBlocks}\n</untrusted>`;

    const result = await llm.completeStructured({
      model,
      schema: RisksModelResponse,
      schemaName: RISKS_SCHEMA_NAME,
      messages: [
        { role: 'system', content: RISKS_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const risks: Risk[] = result.data.risks;
    await this.repo.upsertSlice(pull.id, {
      risks,
      headSha: pull.headSha,
      provider,
      model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    });

    return { risks };
  }
}
