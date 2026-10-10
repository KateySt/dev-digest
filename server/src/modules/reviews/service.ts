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
import { BULK_REVIEW_MAX_PRS } from './constants.js';

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

  /**
   * Resolve the agents of a multi-agent run (S-AC-2/3): de-duplicate keeping the
   * first occurrence's order, then require every id to be an ENABLED agent of
   * this workspace. Any miss -> 400 with the offending ids, nothing created.
   */
  async resolveMultiTargets(workspaceId: string, agentIds: string[]): Promise<AgentRow[]> {
    const distinct = [...new Set(agentIds)];
    const enabled = new Map((await this.agents.listEnabled(workspaceId)).map((a) => [a.id, a]));
    const invalid = distinct.filter((id) => !enabled.has(id));
    if (invalid.length > 0) {
      throw new AppError(
        'invalid_agent_ids',
        'Every agent must exist in this workspace and be enabled.',
        400,
        { agent_ids: invalid },
      );
    }
    return distinct.map((id) => enabled.get(id)!);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight (queued|running) runs for a PR (server-side source of truth,
   *  survives reload). A queued run also carries its 1-based queue position
   *  (1 = starts next); `null` for running runs (S-AC-12). */
  async activeRuns(workspaceId: string, prId: string) {
    const rows = await this.repo.activeRunsForPull(workspaceId, prId);
    return rows.map((r) => ({
      ...r,
      queue_position: r.status === 'queued' ? this.container.reviewQueue.position(r.run_id) : null,
    }));
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
   * Cancel an in-flight run. A QUEUED run leaves the queue and becomes
   * `cancelled` without ever making an LLM call (S-AC-17). A RUNNING run is
   * signalled to stop at its next checkpoint AND its DB row is marked
   * cancelled + the bus completed immediately - so cancel also works for
   * ORPHANED runs (whose background process died on a server restart) where
   * signalling alone would do nothing.
   */
  async cancelRun(runId: string): Promise<void> {
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.container.runBus.cancel(runId);
    // Leave the queue first so a slot can't pick the job up while we write.
    this.container.reviewQueue.remove(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.container.runBus.complete(runId);
  }

  /**
   * Rerun a completed review. Loads the original review's agent and PR,
   * creates a new run with the same agent, and kicks off execution.
   */
  async rerunReview(
    workspaceId: string,
    reviewId: string,
    logger?: Logger,
  ): Promise<{ run_id: string; agent_id: string; agent_name: string }> {
    // Load the original review to get agent ID and PR ID
    const review = await this.repo.getReviewScoped(workspaceId, reviewId);
    if (!review) throw new NotFoundError('Review not found');
    if (!review.agentId) throw new AppError('invalid_review', 'Cannot rerun a review without an agent', 400);

    // Load the PR and repo for the rerun
    const pull = await this.repo.getPull(workspaceId, review.prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Load the agent to verify it still exists and is enabled
    const agent = await this.agents.getById(workspaceId, review.agentId);
    if (!agent) throw new NotFoundError('Agent not found or disabled');

    // Create a new (queued) run with the same agent
    const runId = await this.repo.createAgentRun({
      workspaceId,
      agentId: agent.id,
      prId: review.prId,
      provider: agent.provider,
      model: agent.model,
      status: 'queued',
    });

    // Fire-and-forget: execute the new run in the background
    void this.executor.executeRuns(workspaceId, pull, repo, [{ agent, runId }], logger).catch((err) => {
      logger?.error(
        { reviewId, runId, err: (err as Error).message },
        'review: background rerun execution crashed',
      );
    });

    return { run_id: runId, agent_id: agent.id, agent_name: agent.name };
  }

  /** Reap runs left 'queued'/'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleRunningRuns();
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front (status `queued`) so the SSE route can
   * be subscribed before/while the run progresses. All runs go through the
   * shared review queue, so they run in parallel up to REVIEW_CONCURRENCY. A
   * partial failure in one agent does not abort the others.
   *
   * `multi: true` (the `agentIds` path) also creates the parent
   * `multi_agent_runs` row, atomically with its children (S-AC-1/5).
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
    opts: { multi?: boolean } = {},
  ): Promise<{
    runs: { run_id: string; agent_id: string; agent_name: string }[];
    reviews: ReviewDto[];
    multi_agent_run_id?: string;
  }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY -
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below. The
    // in-flight check and the inserts are ONE atomic step per PR (S-AC-23/24):
    // a second concurrent trigger for the same PR is refused, not queued.
    const refs = targets.map((a) => ({ id: a.id, provider: a.provider, model: a.model }));
    let runIds: string[] | null;
    let multiAgentRunId: string | undefined;
    if (opts.multi) {
      const created = await this.repo.createMultiRunIfIdle(workspaceId, prId, refs);
      runIds = created ? created.runIds : null;
      multiAgentRunId = created?.multiAgentRunId;
    } else {
      runIds = await this.repo.createRunsIfIdle(workspaceId, prId, refs);
    }
    if (runIds === null) {
      const inFlight = await this.repo.inFlightRunsForPull(workspaceId, prId);
      throw new AppError('review_in_progress', 'A review is already running for this pull request.', 409, {
        run_ids: inFlight.runIds,
        multi_agent_run_id: inFlight.multiAgentRunId,
      });
    }
    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: AgentRow; runId: string }[] = [];
    targets.forEach((agent, i) => {
      const runId = runIds![i]!;
      runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    });

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    // executeRuns enqueues synchronously, so queue positions exist on return.
    void this.executor
      .executeRuns(workspaceId, pull, repo, jobs, logger, { groupKey: multiAgentRunId ?? jobs[0]?.runId ?? prId })
      .catch((err) => {
        logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
      });

    return { runs, reviews: [], ...(multiAgentRunId ? { multi_agent_run_id: multiAgentRunId } : {}) };
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
    // Every run goes straight onto the shared review queue (no PR-level
    // limiter: an outer limiter holding a slot while awaiting the queue could
    // deadlock, and would leave rows `queued` while slots are free), so total
    // concurrency is REVIEW_CONCURRENCY server-wide (SPEC-05 S-AC-7 holds at
    // the default of 3). One PR's executeRuns failing never affects the others
    // (S-AC-8). Enqueue order == PR-id order, FIFO.
    for (const { pull, jobs } of toExecute) {
      void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
        logger?.error(
          { prId: pull.id, err: (err as Error).message },
          'bulk review: background execution crashed for one PR',
        );
      });
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
