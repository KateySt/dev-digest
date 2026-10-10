import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { FindingRow } from '../../db/rows.js';
import type { FindingEvalCaseRef } from '../reviews/repository.js';

/** A multi-run parent with its PR identity. */
export interface MultiRunHeader {
  id: string;
  prId: string;
  ranAt: Date;
  prNumber: number;
  prTitle: string;
  repoId: string;
}

/** One child agent run, with the agent name, trace fallback name and its review. */
export interface ChildRunRow {
  runId: string;
  agentId: string | null;
  agentName: string | null;
  traceAgentName: string | null;
  status: string | null;
  error: string | null;
  provider: string | null;
  model: string | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  score: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  multiAgentRunId: string;
  verdict: string | null;
  summary: string | null;
  reviewId: string | null;
  reviewScore: number | null;
  findings: FindingRow[];
}

const traceAgentName = sql<string | null>`${t.runTraces.trace}->'config'->>'agent'`;

/**
 * multi-agent data-access. Workspace scoping goes through the parent row's
 * `workspace_id`; children are only ever read by parent id after that check.
 */
export class MultiAgentRepository {
  constructor(private db: Db) {}

  async getHeader(workspaceId: string, id: string): Promise<MultiRunHeader | undefined> {
    const [row] = await this.db
      .select({
        id: t.multiAgentRuns.id,
        prId: t.multiAgentRuns.prId,
        ranAt: t.multiAgentRuns.ranAt,
        prNumber: t.pullRequests.number,
        prTitle: t.pullRequests.title,
        repoId: t.pullRequests.repoId,
      })
      .from(t.multiAgentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .where(and(eq(t.multiAgentRuns.id, id), eq(t.multiAgentRuns.workspaceId, workspaceId)));
    return row;
  }

  /** Newest first; optionally one PR; at most `limit`. */
  listHeaders(workspaceId: string, prId: string | undefined, limit: number): Promise<MultiRunHeader[]> {
    return this.db
      .select({
        id: t.multiAgentRuns.id,
        prId: t.multiAgentRuns.prId,
        ranAt: t.multiAgentRuns.ranAt,
        prNumber: t.pullRequests.number,
        prTitle: t.pullRequests.title,
        repoId: t.pullRequests.repoId,
      })
      .from(t.multiAgentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .where(
        and(
          eq(t.multiAgentRuns.workspaceId, workspaceId),
          prId ? eq(t.multiAgentRuns.prId, prId) : undefined,
        ),
      )
      .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
      .limit(limit);
  }

  /** Children (selection order) of the given parents, with review + findings. */
  async childRuns(multiRunIds: string[]): Promise<ChildRunRow[]> {
    if (multiRunIds.length === 0) return [];
    const runs = await this.db
      .select({
        runId: t.agentRuns.id,
        agentId: t.agentRuns.agentId,
        agentName: t.agents.name,
        traceAgentName,
        status: t.agentRuns.status,
        error: t.agentRuns.error,
        provider: t.agentRuns.provider,
        model: t.agentRuns.model,
        durationMs: t.agentRuns.durationMs,
        tokensIn: t.agentRuns.tokensIn,
        tokensOut: t.agentRuns.tokensOut,
        costUsd: t.agentRuns.costUsd,
        score: t.agentRuns.score,
        startedAt: t.agentRuns.startedAt,
        finishedAt: t.agentRuns.finishedAt,
        multiAgentRunId: t.agentRuns.multiAgentRunId,
      })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(inArray(t.agentRuns.multiAgentRunId, multiRunIds))
      .orderBy(asc(t.agentRuns.multiAgentOrder), asc(t.agentRuns.ranAt));
    if (runs.length === 0) return [];

    const reviews = await this.db
      .select()
      .from(t.reviews)
      .where(
        and(
          inArray(
            t.reviews.runId,
            runs.map((r) => r.runId),
          ),
          eq(t.reviews.kind, 'review'),
        ),
      );
    const reviewByRun = new Map(reviews.map((r) => [r.runId!, r]));
    const findingRows = reviews.length
      ? await this.db
          .select()
          .from(t.findings)
          .where(
            inArray(
              t.findings.reviewId,
              reviews.map((r) => r.id),
            ),
          )
          .orderBy(asc(t.findings.file), asc(t.findings.startLine), asc(t.findings.id))
      : [];

    return runs.map((r) => {
      const review = reviewByRun.get(r.runId);
      return {
        ...r,
        multiAgentRunId: r.multiAgentRunId!,
        verdict: review?.verdict ?? null,
        summary: review?.summary ?? null,
        reviewId: review?.id ?? null,
        reviewScore: review?.score ?? null,
        findings: review ? findingRows.filter((f) => f.reviewId === review.id) : [],
      };
    });
  }

  /** Enabled agents of the workspace, stable order. */
  enabledAgents(workspaceId: string): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)))
      .orderBy(asc(t.agents.name), asc(t.agents.id));
  }

  /** Last `limit` `done` runs of one agent on any PR of the workspace, newest first. */
  doneRunsForAgent(
    workspaceId: string,
    agentId: string,
    limit: number,
  ): Promise<{ duration_ms: number | null; cost_usd: number | null }[]> {
    return this.db
      .select({ duration_ms: t.agentRuns.durationMs, cost_usd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.agentId, agentId),
          eq(t.agentRuns.status, 'done'),
        ),
      )
      .orderBy(desc(t.agentRuns.ranAt), desc(t.agentRuns.id))
      .limit(limit);
  }

  /** Eval cases created from the given findings (workspace-scoped), grouped by source finding id. */
  async evalCasesForFindings(
    workspaceId: string,
    findingIds: string[],
  ): Promise<Map<string, FindingEvalCaseRef[]>> {
    const out = new Map<string, FindingEvalCaseRef[]>();
    if (findingIds.length === 0) return out;
    const rows = await this.db
      .select({
        findingId: t.evalCases.sourceFindingId,
        caseId: t.evalCases.id,
        ownerKind: t.evalCases.ownerKind,
        ownerId: t.evalCases.ownerId,
      })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), inArray(t.evalCases.sourceFindingId, findingIds)))
      .orderBy(asc(t.evalCases.createdAt));
    for (const r of rows) {
      if (!r.findingId) continue;
      const list = out.get(r.findingId) ?? [];
      list.push({ caseId: r.caseId, ownerKind: r.ownerKind, ownerId: r.ownerId });
      out.set(r.findingId, list);
    }
    return out;
  }
}
