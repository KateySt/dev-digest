import { and, desc, eq, gte } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiInstallationRow, CiRunRow } from '../../db/rows.js';

export interface CiRunFilters {
  agentId?: string;
  repo?: string;
  status?: string;
  since?: Date;
  limit: number;
}

/** A run row joined with its installation's agent/repo — for the global CI
 *  Runs page's filters and table. */
export interface CiRunWithContext {
  run: CiRunRow;
  agentId: string | null;
  agentName: string | null;
  repo: string | null;
}

/**
 * ci data-access. Owns `ci_installations` + `ci_runs`. `ci_runs` has no
 * `workspaceId` of its own — every workspace-scoped query over it joins
 * through `ci_installations` → `agents` (for workspace scoping via the
 * owning agent), same join-through pattern as `eval_runs`.
 */
export class CiRepository {
  constructor(private db: Db) {}

  async listInstallations(agentId: string): Promise<CiInstallationRow[]> {
    return this.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agentId))
      .orderBy(desc(t.ciInstallations.installedAt));
  }

  /** No composite unique key on (agent_id, repo) in the schema — upsert is
   *  select-then-insert-or-touch, not `onConflictDoUpdate`. */
  async upsertInstallation(
    agentId: string,
    repo: string,
    targetType: 'gha' | 'circle' | 'jenkins' | 'cli',
  ): Promise<CiInstallationRow> {
    const [existing] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.agentId, agentId), eq(t.ciInstallations.repo, repo)));
    if (existing) {
      const [row] = await this.db
        .update(t.ciInstallations)
        .set({ installedAt: new Date(), targetType })
        .where(eq(t.ciInstallations.id, existing.id))
        .returning();
      return row!;
    }
    const [row] = await this.db.insert(t.ciInstallations).values({ agentId, repo, targetType }).returning();
    return row!;
  }

  /** Runs for the workspace's agents, newest first, optionally filtered.
   *  Scoped by joining through `ci_installations` → `agents` (workspaceId). */
  async listRuns(workspaceId: string, filters: CiRunFilters): Promise<CiRunWithContext[]> {
    const conditions = [eq(t.agents.workspaceId, workspaceId)];
    if (filters.agentId) conditions.push(eq(t.agents.id, filters.agentId));
    if (filters.repo) conditions.push(eq(t.ciInstallations.repo, filters.repo));
    if (filters.status) conditions.push(eq(t.ciRuns.status, filters.status));
    if (filters.since) conditions.push(gte(t.ciRuns.ranAt, filters.since));

    const rows = await this.db
      .select({ run: t.ciRuns, agentId: t.agents.id, agentName: t.agents.name, repo: t.ciInstallations.repo })
      .from(t.ciRuns)
      .innerJoin(t.ciInstallations, eq(t.ciInstallations.id, t.ciRuns.ciInstallationId))
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(and(...conditions))
      .orderBy(desc(t.ciRuns.ranAt))
      .limit(filters.limit);
    return rows;
  }
}
