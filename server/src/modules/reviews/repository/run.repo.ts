import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { RunSummary, RunTrace } from '@devdigest/shared';

// ---- in-flight / history --------------------------------------------------

/** In-flight runs for a PR (status='running') — the server-side source of
 *  truth for "which agents are running now". Joined with the agent name. */
export async function activeRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<{ run_id: string; agent_id: string | null; agent_name: string | null; ran_at: string | null }[]> {
  const rows = await db
    .select({
      id: t.agentRuns.id,
      agentId: t.agentRuns.agentId,
      ranAt: t.agentRuns.ranAt,
      agentName: t.agents.name,
    })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.prId, prId),
        eq(t.agentRuns.status, 'running'),
      ),
    );
  return rows.map((r) => ({
    run_id: r.id,
    agent_id: r.agentId,
    agent_name: r.agentName ?? null,
    ran_at: r.ranAt ? r.ranAt.toISOString() : null,
  }));
}

/** Which of the given PRs currently have at least one running agent_run —
 *  batch form of `activeRunsForPull`'s in-flight check, for the bulk review
 *  trigger's skip logic (SPEC-05 S-AC-4) and its cost estimate's skip count. */
export async function prIdsWithActiveRun(
  db: DbExecutor,
  workspaceId: string,
  prIds: string[],
): Promise<Set<string>> {
  if (prIds.length === 0) return new Set();
  const rows = await db
    .select({ prId: t.agentRuns.prId })
    .from(t.agentRuns)
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        inArray(t.agentRuns.prId, prIds),
        eq(t.agentRuns.status, 'running'),
      ),
    );
  return new Set(rows.map((r) => r.prId).filter((id): id is string => id != null));
}

/**
 * Atomic per-PR "check in-flight + create runs" (SPEC-05 S-AC-21..24). One
 * transaction takes a transaction-scoped advisory lock keyed on the PR, so
 * concurrent starters for the same PR queue up; the loser re-reads under the
 * lock, sees the winner's committed `running` rows, and gets `null` (nothing
 * created). Locks are per PR and never nested - a caller handling several PRs
 * should walk them in a fixed (id) order. Returns the new run ids, in
 * `agents` order, or null when any run for the PR is already in flight.
 */
export async function createRunsIfIdle(
  db: Db,
  workspaceId: string,
  prId: string,
  agents: { id: string; provider: string | null; model: string | null }[],
): Promise<string[] | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`review-pr:${prId}`}, 0))`);
    const inFlight = await prIdsWithActiveRun(tx, workspaceId, [prId]);
    if (inFlight.has(prId)) return null;
    if (agents.length === 0) return [];
    const rows = await tx
      .insert(t.agentRuns)
      .values(
        agents.map((a) => ({
          workspaceId,
          agentId: a.id,
          prId,
          provider: a.provider,
          model: a.model,
          status: 'running' as const,
          source: 'local' as const,
        })),
      )
      .returning({ id: t.agentRuns.id, agentId: t.agentRuns.agentId });
    // RETURNING order is not contractually the VALUES order; re-align by agent.
    const byAgent = new Map(rows.map((r) => [r.agentId, r.id]));
    return agents.map((a) => byAgent.get(a.id)!);
  });
}

/** Mark still-running runs failed with a reason (a PR whose start failed
 *  after its rows were created - S-AC-22). No-op for runs already finished. */
export async function failRunningRuns(db: Db, runIds: string[], reason: string): Promise<void> {
  if (runIds.length === 0) return;
  await db
    .update(t.agentRuns)
    .set({ status: 'failed', error: reason })
    .where(and(inArray(t.agentRuns.id, runIds), eq(t.agentRuns.status, 'running')));
}

/** Mean recorded cost of that repo's completed ('done') review runs — the
 *  bulk review cost estimate's basis (SPEC-05 S-AC-13), scoped per repo so a
 *  workspace mixing a cheap and an expensive model never blends across repos.
 *  Returns null when the repo has no completed run with a recorded cost, so
 *  the caller reports "unavailable" rather than substituting 0 (S-AC-14). */
export async function meanCostForRepo(db: Db, repoId: string): Promise<number | null> {
  const rows = await db
    .select({ costUsd: t.agentRuns.costUsd })
    .from(t.agentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
    .where(
      and(
        eq(t.pullRequests.repoId, repoId),
        eq(t.agentRuns.status, 'done'),
      ),
    );
  const costs = rows.map((r) => r.costUsd).filter((c): c is number => c != null);
  if (costs.length === 0) return null;
  return costs.reduce((sum, c) => sum + c, 0) / costs.length;
}

/** All runs for a PR (any status), newest first — the PR run history. */
export async function listRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<RunSummary[]> {
  const rows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.prId, prId)))
    .orderBy(desc(t.agentRuns.ranAt));
  return rows.map(({ run, agentName }) => ({
    run_id: run.id,
    agent_id: run.agentId,
    agent_name: agentName ?? null,
    pr_number: null,
    provider: run.provider,
    model: run.model,
    status: run.status,
    error: run.error,
    duration_ms: run.durationMs,
    tokens_in: run.tokensIn,
    tokens_out: run.tokensOut,
    cost_usd: run.costUsd,
    findings_count: run.findingsCount,
    grounding: run.grounding,
    ran_at: run.ranAt ? run.ranAt.toISOString() : null,
    score: run.score,
    blockers: run.blockers,
  }));
}

/**
 * Delete one agent run (+ its trace via FK cascade) AND the review it produced.
 * Workspace-scoped. `reviews.run_id` has no FK to `agent_runs`, so the review
 * (and its findings, which DO cascade from `reviews`) must be removed explicitly
 * here — otherwise deleting a run from the timeline leaves its findings orphaned
 * in the Review Runs list below.
 */
export async function deleteAgentRun(
  db: Db,
  workspaceId: string,
  runId: string,
): Promise<boolean> {
  await db
    .delete(t.reviews)
    .where(and(eq(t.reviews.runId, runId), eq(t.reviews.workspaceId, workspaceId)));
  const rows = await db
    .delete(t.agentRuns)
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.workspaceId, workspaceId)))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** Mark a still-running run as cancelled (no-op if it already finished). */
export async function cancelRunIfRunning(db: Db, runId: string): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'cancelled' })
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.status, 'running')))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** On boot: any run still 'running' is orphaned (its process died / restarted),
 *  so mark it failed. Prevents permanently stuck "running" runs in the UI. */
export async function reapStaleRunningRuns(db: Db): Promise<number> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'failed' })
    .where(eq(t.agentRuns.status, 'running'))
    .returning({ id: t.agentRuns.id });
  return rows.length;
}

// ---- observability: agent_runs + run_traces -------------------------------

/** Create an agent_runs row in `running` state; returns its id (= the runId). */
export async function createAgentRun(
  db: Db,
  values: {
    workspaceId: string;
    agentId: string | null;
    prId: string;
    provider: string | null;
    model: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: values.workspaceId,
      agentId: values.agentId,
      prId: values.prId,
      provider: values.provider,
      model: values.model,
      status: 'running',
      source: 'local',
    })
    .returning({ id: t.agentRuns.id });
  return row!.id;
}

export async function completeAgentRun(
  db: Db,
  runId: string,
  values: {
    status: 'done' | 'failed' | 'cancelled';
    durationMs: number;
    tokensIn: number;
    tokensOut: number;
    /** USD spent (usage × pricing); null when unknown. */
    costUsd?: number | null;
    findingsCount: number;
    grounding: string;
    /** Review score (0-100); null on failed/cancelled runs. */
    score?: number | null;
    /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
    blockers?: number | null;
    /** Failure reason (status='failed') / cancellation note. Null clears it. */
    error?: string | null;
  },
): Promise<void> {
  await db
    .update(t.agentRuns)
    .set({
      status: values.status,
      durationMs: values.durationMs,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      costUsd: values.costUsd ?? null,
      findingsCount: values.findingsCount,
      grounding: values.grounding,
      score: values.score ?? null,
      blockers: values.blockers ?? null,
      error: values.error ?? null,
    })
    .where(eq(t.agentRuns.id, runId));
}

/** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
export async function saveRunTrace(db: Db, runId: string, trace: RunTrace): Promise<void> {
  await db
    .insert(t.runTraces)
    .values({ runId, trace })
    .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace } });
}

export async function getRunTrace(db: Db, runId: string): Promise<RunTrace | undefined> {
  const [row] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
  return row ? (row.trace as RunTrace) : undefined;
}
