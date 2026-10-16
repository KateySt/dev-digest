import { and, count, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { IN_FLIGHT } from '../reviews/repository/run.repo.js';

/** Counts of in-flight work. Every query is scoped by workspaceId. */
export class ActivityRepository {
  constructor(private db: Db) {}

  /** Review runs queued or running — single-agent and multi-agent members alike. */
  async reviewsInFlight(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), inArray(t.agentRuns.status, [...IN_FLIGHT])));
    return row?.n ?? 0;
  }

  async evalsRunning(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.status, 'running')));
    return row?.n ?? 0;
  }
}
