import PQueue from 'p-queue';
import type { Container } from '../../platform/container.js';
import type { BulkReviewOutcome, FindingActionKind, PrReviewComment, ReviewEstimate, RunEventKind, RunTrace } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import { ReviewRepository } from './repository.js';
import { type ReviewDto, type ReviewDtoFinding } from './helpers.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl, replyToFinding as replyToFindingImpl } from './findings.js';
import { reviewToDto } from './helpers.js';
import { needsReviewPrIds } from '../pulls/status.js';
import { BULK_REVIEW_CONCURRENCY, BULK_REVIEW_MAX_PRS } from './constants.js';

// Re-export DTO types + converters for backward-compatible imports from
// './service.js' (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';
export type { ReviewDto, ReviewDtoFinding } from './helpers.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over container.runBus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents);
  }

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `all` → all enabled agents; else a single agent.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean },
  ): Promise<AgentRow[]> {
    if (opts.all) return this.agents.listEnabled(workspaceId);
    if (opts.agentId) {
      const agent = await this.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new AppError('invalid_run_request', 'Provide agentId or all:true', 400);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(runId: string): Promise<void> {
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.container.runBus.cancel(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.container.runBus.complete(runId);
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleRunningRuns();
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
  ): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewDto[] }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY -
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below. The
    // in-flight check and the inserts are ONE atomic step per PR (S-AC-23/24):
    // a second concurrent trigger for the same PR is refused, not queued.
    const runIds = await this.repo.createRunsIfIdle(
      workspaceId,
      prId,
      targets.map((a) => ({ id: a.id, provider: a.provider, model: a.model })),
    );
    if (runIds === null) {
      throw new AppError('review_in_progress', 'A review is already running for this pull request.', 409);
    }
    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: AgentRow; runId: string }[] = [];
    targets.forEach((agent, i) => {
      const runId = runIds[i]!;
      runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    });

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { runs, reviews: [] };
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.container.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // SPEC-05 — bulk "Review all" over a repo's needs_review set.
  // ===========================================================================

  /** Repo ownership check (S-AC-11) + the repo's current needs_review set,
   *  shared by the estimate and the trigger so they can never derive the set
   *  two different ways (S-AC-16). */
  private async resolveRepoScope(workspaceId: string, repoId: string) {
    const repo = await this.repo.getRepo(repoId);
    if (!repo || repo.workspaceId !== workspaceId) throw new NotFoundError('Repo not found');
    const pulls = await this.repo.listPullsForRepo(repoId);
    const prIds = needsReviewPrIds(pulls);
    return { repo, pulls, prIds };
  }

  /** GET .../pulls/review-estimate — what "Review all" would cost, computed
   *  from history (S-AC-12..16). Never triggers anything. */
  async estimateBulkReview(workspaceId: string, repoId: string): Promise<ReviewEstimate> {
    const { prIds } = await this.resolveRepoScope(workspaceId, repoId);
    const enabled = await this.agents.listEnabled(workspaceId);
    const inFlight = await this.repo.prIdsWithActiveRun(workspaceId, prIds);
    const targetable = prIds.filter((id) => !inFlight.has(id));
    const runCount = targetable.length * enabled.length;
    const meanCost = await this.repo.meanCostForRepo(repoId);
    return {
      pr_count: prIds.length,
      agent_count: enabled.length,
      run_count: runCount,
      approx_cost_usd: meanCost == null ? null : meanCost * runCount,
      approximate: true,
      skip_count: inFlight.size,
    };
  }

  /**
   * POST .../pulls/review — bulk-trigger every PR in the repo's OWN derived
   * needs_review set (S-AC-1; a client-supplied list is never accepted, so a
   * caller cannot widen a batch). Each targeted PR's agent_run rows are
   * created synchronously (so the response can report real run ids), then
   * the actual (slow) execution runs in the background with bounded
   * concurrency across PRs — never awaited by this method.
   */
  async runBulkReview(
    workspaceId: string,
    repoId: string,
    logger?: Logger,
  ): Promise<BulkReviewOutcome[]> {
    const enabled = await this.agents.listEnabled(workspaceId);
    if (enabled.length === 0) {
      throw new AppError('no_enabled_agents', 'Enable at least one agent before running a bulk review.', 400);
    }

    const { repo, pulls, prIds } = await this.resolveRepoScope(workspaceId, repoId);
    if (prIds.length === 0) {
      throw new AppError('nothing_to_review', 'No pull requests currently need review.', 400);
    }
    if (prIds.length > BULK_REVIEW_MAX_PRS) {
      throw new AppError(
        'bulk_review_too_large',
        `${prIds.length} pull requests need review — the maximum for one "Review all" is ${BULK_REVIEW_MAX_PRS}.`,
        400,
      );
    }

    const pullById = new Map(pulls.map((p) => [p.id, p]));

    // Each PR's "check in-flight + create runs" is its own short atomic step
    // (`createRunsIfIdle`, S-AC-21), walked in a fixed PR-id order so two
    // overlapping batches take their per-PR locks in the same order. Outcomes
    // are reported in the derived set's order regardless.
    const outcomes = new Map<string, BulkReviewOutcome>();
    const toExecute: { pull: (typeof pulls)[number]; jobs: { agent: AgentRow; runId: string }[] }[] = [];
    const agentRefs = enabled.map((a) => ({ id: a.id, provider: a.provider, model: a.model }));

    for (const prId of [...prIds].sort()) {
      const pull = pullById.get(prId);
      if (!pull) {
        // Vanishingly unlikely (deleted between the two reads above), but a
        // batch's per-PR isolation (S-AC-8) covers this shape too.
        outcomes.set(prId, { pr_id: prId, outcome: 'failed', run_ids: [], reason: 'Pull request no longer exists' });
        continue;
      }
      // Per-PR isolation (S-AC-8, S-AC-22): whatever goes wrong starting this
      // PR is contained to it - rows already created for it are marked failed
      // (never left running), its outcome is `failed`, the batch carries on.
      let createdRunIds: string[] | null = null;
      try {
        createdRunIds = await this.repo.createRunsIfIdle(workspaceId, prId, agentRefs);
        if (createdRunIds === null) {
          outcomes.set(prId, { pr_id: prId, outcome: 'skipped', run_ids: [], reason: 'already has a run in flight' });
          continue;
        }
        const ids = createdRunIds;
        const jobs = enabled.map((agent, i) => ({ agent, runId: ids[i]! }));
        toExecute.push({ pull, jobs });
        outcomes.set(prId, { pr_id: prId, outcome: 'started', run_ids: ids });
      } catch (err) {
        const reason = `Failed to start review: ${(err as Error).message}`;
        logger?.error({ prId, err: (err as Error).message }, 'bulk review: failed to start one PR');
        if (createdRunIds && createdRunIds.length > 0) {
          await this.repo.failRunningRuns(createdRunIds, reason).catch(() => undefined);
          // Never execute a PR that was reported as failed.
          const idx = toExecute.findIndex((e) => e.pull.id === prId);
          if (idx >= 0) toExecute.splice(idx, 1);
        }
        outcomes.set(prId, { pr_id: prId, outcome: 'failed', run_ids: [], reason });
      }
    }
    const results: BulkReviewOutcome[] = prIds.map((id) => outcomes.get(id)!);

    // Fire-and-forget: the HTTP response returns now with every outcome
    // already decided; actual review execution happens in the background.
    // Bounded to BULK_REVIEW_CONCURRENCY PRs at once — each PR's own jobs
    // already run sequentially inside executeRuns, so this bound is also the
    // bound on total concurrent runs (S-AC-7). One PR's executeRuns throwing
    // never stops the queue from draining the rest (S-AC-8).
    const queue = new PQueue({ concurrency: BULK_REVIEW_CONCURRENCY });
    for (const { pull, jobs } of toExecute) {
      void queue.add(() =>
        this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
          logger?.error(
            { prId: pull.id, err: (err as Error).message },
            'bulk review: background execution crashed for one PR',
          );
        }),
      );
    }

    return results;
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding }> {
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  /** "Reply to author" - post `body` to GitHub, record the comment URL/time on the finding. */
  async replyToFinding(workspaceId: string, findingId: string, body: string): Promise<PrReviewComment> {
    return replyToFindingImpl(this.container, this.repo, workspaceId, findingId, body);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.reviewsForPull(prId);
    const names = new Map<string, string>();
    for (const { review } of rows) {
      if (review.agentId && !names.has(review.agentId)) {
        const a = await this.agents.getById(workspaceId, review.agentId);
        if (a) names.set(review.agentId, a.name);
      }
    }
    const evalCases = await this.repo.evalCasesForFindings(
      workspaceId,
      rows.flatMap(({ findings }) => findings.map((f) => f.id)),
    );
    return rows.map(({ review, findings }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null, evalCases),
    );
  }

  async getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return this.repo.getRunTrace(runId);
  }
}
