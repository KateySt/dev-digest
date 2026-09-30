import type { PrHistory } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../../db/rows.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { HistoryRepository } from './repository.js';
import { groupOverlapsByPr, toPrHistoryItem } from './helpers.js';
import { HISTORY_LIMIT } from './constants.js';

/**
 * HistoryService — "prior PRs touching these files": other merged/closed PRs
 * in the same repo that changed at least one file this PR also changed.
 * Mirrors `BlastService`'s constructor shape, but deliberately has NO cache
 * check (unlike `BlastService`/`CommitsService`).
 *
 * **Caching: none, on purpose.** Unlike blast (an expensive repo-intel read
 * whose correctness is tied to `repo_index_state.last_indexed_sha`), this is
 * a cheap two-table join over data that's fully populated at PR-import time
 * (`pull_requests` + `pr_files`), with no external staleness source. A live
 * read is simpler and more correct: a sibling PR that merges later shows up
 * on the very next request, with no invalidation hook to wire up.
 */
export class HistoryService {
  private repo: HistoryRepository;
  private reviews: ReviewRepository;

  constructor(private container: Container) {
    this.repo = new HistoryRepository(container.db);
    this.reviews = container.reviewRepo;
  }

  async getHistory(_workspaceId: string, pull: PullRow): Promise<PrHistory> {
    const files = await this.reviews.getPrFiles(pull.id);
    // No changed files to compare against — nothing could overlap.
    if (files.length === 0) return { history: [] };

    const rows = await this.repo.findOverlappingPrs(
      pull.repoId,
      pull.id,
      files.map((f) => f.path),
      HISTORY_LIMIT,
    );
    const grouped = groupOverlapsByPr(rows);
    const history = grouped
      .map((g) => toPrHistoryItem(g.pull, g.overlapPaths))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return { history };
  }
}
