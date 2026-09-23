import type { SmartDiff } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { TOO_BIG_LINES } from './constants.js';
import { buildFindingLinesByPath, buildGroups } from './helpers.js';

/**
 * SmartDiffService — groups a PR's changed files by role (core/tests/wiring/
 * docs/boilerplate) for the Files-changed tab, and marks which lines already
 * have findings so the diff viewer can render an inline dot indicator.
 *
 * No LLM call, ever — classification is a pure path-pattern match
 * (`helpers.ts#classifyFile`), so this module owns no `prompts.ts`.
 * Reads cross-table via `container.reviewRepo` (files + reviews/findings)
 * exactly like `IntentService` does for its own diff-shape fallback signal —
 * see `modules/intent/service.ts:85`. No table of its own, so no
 * `repository.ts` either.
 */
export class SmartDiffService {
  private reviews: ReviewRepository;

  constructor(private container: Container) {
    this.reviews = container.reviewRepo;
  }

  async getForPull(prId: string): Promise<SmartDiff> {
    const [files, reviews] = await Promise.all([
      this.reviews.getPrFiles(prId),
      this.reviews.reviewsForPull(prId),
    ]);

    const findingLinesByPath = buildFindingLinesByPath(reviews.flatMap((r) => r.findings));
    const groups = buildGroups(files, findingLinesByPath);

    const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

    return {
      groups,
      split_suggestion: {
        too_big: totalLines > TOO_BIG_LINES,
        total_lines: totalLines,
        // Actual split proposals are out of scope this pass (the largeTitle/
        // largeBody UI stays unused) — an empty array keeps the contract
        // satisfied without inventing a split heuristic nobody asked for yet.
        proposed_splits: [],
      },
    };
  }
}
