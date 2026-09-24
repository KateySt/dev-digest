import type { BlastRadius } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { RunLogger } from '../../platform/run-logger.js';
import type { PullRow } from '../../db/rows.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { BlastRepository } from './repository.js';
import { toBlastRadius, buildSummary } from './helpers.js';

/**
 * BlastService — derives a PR's blast radius (changed symbols → downstream
 * callers → affected endpoints/crons) per-PR, cached by head sha. No LLM
 * call, ever — this is a pure structural read over `container.repoIntel`
 * (see `SmartDiffService`'s header comment for the same "no prompts.ts"
 * precedent). Mirrors `RisksService`'s cache-check shape.
 */
export class BlastService {
  private repo: BlastRepository;
  private reviews: ReviewRepository;

  constructor(private container: Container) {
    this.repo = new BlastRepository(container.db);
    this.reviews = container.reviewRepo;
  }

  /**
   * Cache check: reuse the persisted slice when the head sha matches AND the
   * slice wasn't computed on the degraded path. A degraded result is always
   * treated as a cache miss, even when `headSha` still matches, so the panel
   * recomputes once the repo-intel index catches up (resolved open question).
   */
  // `workspaceId` is unused here (no model call, so no feature-model resolution
  // to scope) but kept for signature parity with sibling services (RisksService,
  // IntentService) that DO need it.
  async getOrCompute(workspaceId: string, pull: PullRow, runLog?: RunLogger): Promise<BlastRadius> {
    const existing = await this.repo.getSlice(pull.id);
    if (existing && existing.headSha === pull.headSha && !existing.degraded) {
      runLog?.info('Blast radius cache hit — head_sha unchanged, reusing persisted blast radius (no recompute)');
      return existing.blast;
    }
    runLog?.info(
      'Blast radius cache miss — head_sha changed, no prior blast radius, or prior result was degraded; recomputing',
    );

    const files = await this.reviews.getPrFiles(pull.id);

    // No changed files to attribute a blast radius to — persist an empty,
    // fresh (non-degraded) slice instead of calling the facade on nothing.
    if (files.length === 0) {
      const blast: BlastRadius = { changed_symbols: [], downstream: [], summary: buildSummary({ changed_symbols: [], downstream: [] }) };
      await this.repo.upsertSlice(pull.id, { blast, headSha: pull.headSha, degraded: false });
      return blast;
    }

    const result = await this.container.repoIntel.getBlastRadius(
      pull.repoId,
      files.map((f) => f.path),
    );

    const radius = toBlastRadius(result);
    const blast: BlastRadius = { ...radius, summary: buildSummary(radius) };

    await this.repo.upsertSlice(pull.id, {
      blast,
      headSha: pull.headSha,
      degraded: result.degraded ?? false,
    });

    return blast;
  }
}
