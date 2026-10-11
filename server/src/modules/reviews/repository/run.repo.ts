import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { RunSummary, RunTrace } from '@devdigest/shared';

/** A run in either of these states is "in flight" (SPEC-10 S-AC-7): a `queued`
 *  row is merely waiting for a slot but still blocks a second review. */
const IN_FLIGHT = ['queued', 'running'] as const;

/** Reason stamped on rows orphaned by a restart (S-AC-18). */
export const SERVER_RESTART_REASON = 'Server restarted while the run was queued or running';

// ---- in-flight / history --------------------------------------------------

export type ActiveRunRow = {
  run_id: string;
  status: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
};

/** In-flight runs for a PR (status queued|running) — the server-side source of
 *  truth for "which agents are active now". Joined with the agent name. The
 *  queue position is added by the service (it lives in memory, not the DB). */
export async function activeRunsForPull(db: Db, workspaceId: string, prId: string): Promise<ActiveRunRow[]> {
  const rows = await db
    .select({
      id: t.agentRuns.id,
      status: t.agentRuns.status,
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
        inArray(t.agentRuns.status, [...IN_FLIGHT]),
      ),
    )
    .orderBy(t.agentRuns.ranAt, t.agentRuns.multiAgentOrder);
  return rows.map((r) => ({
    run_id: r.id,
    status: r.status ?? 'running',
    agent_id: r.agentId,
    agent_name: r.agentName ?? null,
    ran_at: r.ranAt ? r.ranAt.toISOString() : null,
  }));
}

/** Which of the given PRs currently have at least one queued/running agent_run —
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
        inArray(t.agentRuns.status, [...IN_FLIGHT]),
      ),
    );
  return new Set(rows.map((r) => r.prId).filter((id): id is string => id != null));
}

type AgentRef = { id: string; provider: string | null; model: string | null };

/**
 * Atomic per-PR "check in-flight + create runs" (SPEC-05 S-AC-21..24). One
 * transaction takes a transaction-scoped advisory lock keyed on the PR, so
 * concurrent starters for the same PR queue up; the loser re-reads under the
 * lock, sees the winner's committed `queued`/`running` rows, and gets `null`
 * (nothing created). Locks are per PR and never nested - a caller handling
 * several PRs should walk them in a fixed (id) order. Returns the new run ids,
 * in `agents` order, or null when any run for the PR is already in flight.
 * New rows are `queued`; the executor flips them to `running` when a slot frees.
 */
export async function createRunsIfIdle(
  db: Db,
  workspaceId: string,
  prId: string,
  agents: AgentRef[],
): Promise<string[] | null> {
  const res = await createRunsLocked(db, workspaceId, prId, agents, false);
  return res === null ? null : res.runIds;
}

/**
 * SPEC-10 S-AC-1/5: same atomic step as `createRunsIfIdle`, but ALSO inserts the
 * parent `multi_agent_runs` row and links every child (`multi_agent_order` =
 * the agent's position in `agents`) in the SAME transaction, so a failure
 * leaves neither a parent nor a child behind.
 */
export async function createMultiRunIfIdle(
  db: Db,
  workspaceId: string,
  prId: string,
  agents: AgentRef[],
): Promise<{ multiAgentRunId: string; runIds: string[] } | null> {
  const res = await createRunsLocked(db, workspaceId, prId, agents, true);
  if (res === null) return null;
  return { multiAgentRunId: res.multiAgentRunId!, runIds: res.runIds };
}

async function createRunsLocked(
  db: Db,
  workspaceId: string,
  prId: string,
  agents: AgentRef[],
  multi: boolean,
): Promise<{ runIds: string[]; multiAgentRunId: string | null } | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`review-pr:${prId}`}, 0))`);
    const inFlight = await prIdsWithActiveRun(tx, workspaceId, [prId]);
    if (inFlight.has(prId)) return null;
    let multiAgentRunId: string | null = null;
    if (multi) {
      const [parent] = await tx
        .insert(t.multiAgentRuns)
        .values({ workspaceId, prId })
        .returning({ id: t.multiAgentRuns.id });
      multiAgentRunId = parent!.id;
    }
    if (agents.length === 0) return { runIds: [], multiAgentRunId };
    const rows = await tx
      .insert(t.agentRuns)
      .values(
        agents.map((a, i) => ({
          workspaceId,
          agentId: a.id,
          prId,
          provider: a.provider,
          model: a.model,
          status: 'queued' as const,
          source: 'local' as const,
          ...(multiAgentRunId ? { multiAgentRunId, multiAgentOrder: i } : {}),
        })),
      )
      .returning({ id: t.agentRuns.id, agentId: t.agentRuns.agentId });
    // RETURNING order is not contractually the VALUES order; re-align by agent.
    const byAgent = new Map(rows.map((r) => [r.agentId, r.id]));
    return { runIds: agents.map((a) => byAgent.get(a.id)!), multiAgentRunId };
  });
}

/** The in-flight (queued/running) runs of a PR, with their parent multi-run id
 *  when present — the details of a 409 `review_in_progress` (S-AC-7). */
export async function inFlightRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<{ runIds: string[]; multiAgentRunId: string | null }> {
  const rows = await db
    .select({ id: t.agentRuns.id, multi: t.agentRuns.multiAgentRunId })
    .from(t.agentRuns)
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.prId, prId),
        inArray(t.agentRuns.status, [...IN_FLIGHT]),
      ),
    )
    .orderBy(t.agentRuns.ranAt, t.agentRuns.multiAgentOrder);
  return { runIds: rows.map((r) => r.id), multiAgentRunId: rows.find((r) => r.multi)?.multi ?? null };
}

/** `queued` → `running` when a queue slot frees (writes `started_at`). Returns
 *  false when the row is no longer queued (cancelled while waiting), in which
 *  case the caller must NOT run it. */
export async function markRunStarted(db: Db, runId: string): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'running', startedAt: new Date() })
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.status, 'queued')))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** True when the run row is `cancelled`. The in-memory bus drops its cancel
 *  flag on `complete()`, so a still-running executor consults the DB instead. */
export async function isRunCancelled(db: Db, runId: string): Promise<boolean> {
  const [row] = await db.select({ status: t.agentRuns.status }).from(t.agentRuns).where(eq(t.agentRuns.id, runId));
  return row?.status === 'cancelled';
}

/** Mark still-queued/running runs failed with a reason (a PR whose start failed
 *  after its rows were created - S-AC-22). No-op for runs already finished. */
export async function failRunningRuns(db: Db, runIds: string[], reason: string): Promise<void> {
  if (runIds.length === 0) return;
  await db
    .update(t.agentRuns)
    .set({ status: 'failed', error: reason, finishedAt: new Date() })
    .where(and(inArray(t.agentRuns.id, runIds), inArray(t.agentRuns.status, [...IN_FLIGHT])));
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

/** Mark a still-queued OR running run as cancelled (no-op if it already
 *  finished). Stamps `finished_at`. */
export async function cancelRunIfRunning(db: Db, runId: string): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'cancelled', finishedAt: new Date() })
    .where(and(eq(t.agentRuns.id, runId), inArray(t.agentRuns.status, [...IN_FLIGHT])))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** On boot: any run still 'queued' or 'running' is orphaned (the queue is
 *  in-memory; its process died / restarted), so mark it failed with a restart
 *  reason (S-AC-18). Prevents permanently stuck runs that also block the PR. */
export async function reapStaleRunningRuns(db: Db): Promise<number> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'failed', error: SERVER_RESTART_REASON, finishedAt: new Date() })
    .where(inArray(t.agentRuns.status, [...IN_FLIGHT]))
    .returning({ id: t.agentRuns.id });
  return rows.length;
}

// ---- observability: agent_runs + run_traces -------------------------------

/** Create an agent_runs row (default `queued`); returns its id (= the runId). */
export async function createAgentRun(
  db: Db,
  values: {
    workspaceId: string;
    agentId: string | null;
    prId: string;
    provider: string | null;
    model: string | null;
    status?: 'queued' | 'running';
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
      status: values.status ?? 'queued',
      source: 'local',
    })
    .returning({ id: t.agentRuns.id });
  return row!.id;
}

/** Terminal write for a run. Returns false when nothing was written because a
 *  cancel landed first (a late done/failed never overwrites `cancelled`). */
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
): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({
      status: values.status,
      finishedAt: new Date(),
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
    .where(
      values.status === 'cancelled'
        ? eq(t.agentRuns.id, runId)
        : and(eq(t.agentRuns.id, runId), or(isNull(t.agentRuns.status), ne(t.agentRuns.status, 'cancelled'))),
    )
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
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
