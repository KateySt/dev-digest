import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { DEFAULT_RUNS_LIMIT } from './constants.js';

/** A finding's outcome + severity, joined to the agent that produced it (via
 *  its review) — the raw material for accept-rate / findings-by-severity. */
export interface FindingOutcomeRow {
  agentId: string | null;
  severity: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

/**
 * A1-adjacent — agent-performance data-access. Read-only: aggregates
 * `agent_runs` + `findings` (joined via `reviews`, which is how a finding
 * reaches its agent — `findings` itself has no `agentId` column). Owns no
 * tables; all reduction happens in `helpers.ts` (kept separate so the pure
 * math is unit-testable without a DB).
 */
export class AgentPerformanceRepository {
  constructor(private db: Db) {}

  /** Every agent_runs row for one agent, newest first. */
  async runsForAgent(workspaceId: string, agentId: string): Promise<(typeof t.agentRuns.$inferSelect)[]> {
    return this.db
      .select()
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.agentId, agentId)))
      .orderBy(desc(t.agentRuns.ranAt));
  }

  /** Every agent_runs row in the workspace, newest first (for the global page). */
  async runsForWorkspace(workspaceId: string): Promise<(typeof t.agentRuns.$inferSelect)[]> {
    return this.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.workspaceId, workspaceId))
      .orderBy(desc(t.agentRuns.ranAt));
  }

  /** Findings' severity + accept/dismiss outcome for one agent, joined via reviews. */
  async findingOutcomesForAgent(workspaceId: string, agentId: string): Promise<FindingOutcomeRow[]> {
    const rows = await this.db
      .select({
        agentId: t.reviews.agentId,
        severity: t.findings.severity,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.agentId, agentId)));
    return rows;
  }

  /** Findings' severity + accept/dismiss outcome for every agent in the workspace. */
  async findingOutcomesForWorkspace(workspaceId: string): Promise<FindingOutcomeRow[]> {
    const rows = await this.db
      .select({
        agentId: t.reviews.agentId,
        severity: t.findings.severity,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(eq(t.reviews.workspaceId, workspaceId), isNotNull(t.reviews.agentId)));
    return rows;
  }

  /** Recent runs for one agent, across all PRs — the Stats tab's "Run history"
   *  table. Mirrors `reviews/repository/run.repo.ts`'s `listRunsForPull` shape,
   *  joined to `pull_requests` for `pr_number` instead of being PR-scoped. */
  async recentRunsForAgent(
    workspaceId: string,
    agentId: string,
    limit = DEFAULT_RUNS_LIMIT,
  ): Promise<
    {
      run: typeof t.agentRuns.$inferSelect;
      agentName: string | null;
      prNumber: number | null;
    }[]
  > {
    const rows = await this.db
      .select({ run: t.agentRuns, agentName: t.agents.name, prNumber: t.pullRequests.number })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .leftJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.agentId, agentId)))
      .orderBy(desc(t.agentRuns.ranAt))
      .limit(limit);
    return rows;
  }
}
