import PQueue from 'p-queue';
import type { GitHubClient, PrCommitHistory, RepoRef, Severity } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../../db/rows.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { CommitsRepository } from './repository.js';
import { toCommitHistory, worstByFile, type FindingForWorst } from './helpers.js';

/** Bounded fan-out for cold-start commit→files fetches — a very large PR does
 *  more work on first load, but every subsequent load is fully cached (see
 *  `commit_files` table comment), so an unbounded cap on commit count isn't
 *  needed, just bounded parallelism. */
const FETCH_CONCURRENCY = 5;

/**
 * CommitsService — the Overview tab's "Commits" panel: a PR's commits, each
 * with the files it touched and (for files the PR's latest review flagged)
 * the worst severity + line to jump to. Commit→files is fetched from GitHub
 * once per (repo, sha) and cached forever (`commit_files` is a permanent
 * cache, not head-sha-keyed like the rest of the brief). Mirrors
 * `BlastService`'s constructor shape.
 */
export class CommitsService {
  private repo: CommitsRepository;
  private reviews: ReviewRepository;

  constructor(private container: Container) {
    this.repo = new CommitsRepository(container.db);
    this.reviews = container.reviewRepo;
  }

  async getCommitHistory(_workspaceId: string, pull: PullRow): Promise<PrCommitHistory> {
    const commits = await this.repo.listCommits(pull.id);
    // Empty `pr_commits` (offline first visit — PR detail never fetched) is a
    // normal empty state to render, not an error — never fall back to a live
    // `pulls.listCommits` GitHub call here (resolved open question #3).
    if (commits.length === 0) return { commits: [] };

    const shas = commits.map((c) => c.sha);
    const filesBySha = await this.repo.getCachedPaths(pull.repoId, shas);
    const missing = shas.filter((sha) => !filesBySha.has(sha));
    if (missing.length > 0) {
      await this.fetchMissing(pull.repoId, missing, filesBySha);
    }

    // Same "latest review" selection `modules/pulls/routes.ts` uses for the
    // PR-list badges: newest `kind === 'review'` row (`reviewsForPull` is
    // already newest-first, so `.find` returns it).
    const reviews = await this.reviews.reviewsForPull(pull.id);
    const latest = reviews.find((r) => r.review.kind === 'review');
    const findings: FindingForWorst[] = (latest?.findings ?? []).map((f) => ({
      file: f.file,
      severity: f.severity as Severity,
      start_line: f.startLine,
      dismissed_at: f.dismissedAt ? f.dismissedAt.toISOString() : null,
    }));
    const worst = worstByFile(findings);

    return toCommitHistory(commits, filesBySha, worst);
  }

  /**
   * Fetch + cache file lists for shas missing from the cache, with bounded
   * concurrency. Wraps the whole GitHub leg in try/catch and degrades to an
   * empty file list per sha on failure (`container.github()` throws when
   * `GITHUB_TOKEN` is unset) — same local-first offline posture as the rest
   * of `modules/pulls/routes.ts`, never a 500.
   */
  private async fetchMissing(
    repoId: string,
    shas: string[],
    filesBySha: Map<string, string[]>,
  ): Promise<void> {
    let repoRef: RepoRef;
    let github: GitHubClient;
    try {
      const repoRow = await this.reviews.getRepo(repoId);
      if (!repoRow) throw new Error('repo not found');
      repoRef = { owner: repoRow.owner, name: repoRow.name };
      github = await this.container.github();
    } catch {
      for (const sha of shas) filesBySha.set(sha, []);
      return;
    }

    const queue = new PQueue({ concurrency: FETCH_CONCURRENCY });
    await queue.addAll(
      shas.map((sha) => async () => {
        try {
          const paths = await github.listCommitFiles(repoRef, sha);
          await this.repo.cachePaths(repoId, sha, paths);
          filesBySha.set(sha, paths);
        } catch {
          filesBySha.set(sha, []);
        }
      }),
    );
  }
}
