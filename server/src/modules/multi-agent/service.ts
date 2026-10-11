import type {
  AgentColumn,
  AgentColumnStatus,
  AgentEstimates,
  MultiAgentCancelResponse,
  MultiAgentRun,
  MultiAgentRunSummary,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { findingRowToDto } from '../reviews/helpers.js';
import { ReviewService } from '../reviews/service.js';
import { ESTIMATE_SAMPLE_SIZE } from './constants.js';
import {
  buildDisagreementRows,
  computeAgentEstimate,
  computeTotals,
  groupFindings,
  type AgentRunInput,
} from './helpers.js';
import { MultiAgentRepository, type ChildRunRow, type MultiRunHeader } from './repository.js';

const STATUSES: readonly AgentColumnStatus[] = ['queued', 'running', 'done', 'failed', 'cancelled'];

/** A NULL/unknown status on a child row means the executor has not stamped it yet: treat as running. */
function statusOf(row: ChildRunRow): AgentColumnStatus {
  return (STATUSES as readonly string[]).includes(row.status ?? '')
    ? (row.status as AgentColumnStatus)
    : 'running';
}

/** Overall status of a multi-run derived from its children (list view). */
function overallStatus(statuses: AgentColumnStatus[]): MultiAgentRunSummary['status'] {
  if (statuses.includes('running')) return 'running';
  if (statuses.includes('queued')) return 'queued';
  if (statuses.includes('done')) return 'done';
  if (statuses.length > 0 && statuses.every((s) => s === 'cancelled')) return 'cancelled';
  return 'failed';
}

/**
 * multi-agent read model + cancel-all. Orchestrates the reviews module (finding
 * DTOs, per-run cancel) and the shared queue; groups/rows/totals are computed
 * on read by the pure helpers.
 */
export class MultiAgentService {
  constructor(
    private container: Container,
    private repo: MultiAgentRepository = new MultiAgentRepository(container.db),
    private reviews: ReviewService = new ReviewService(container),
  ) {}

  async get(workspaceId: string, id: string): Promise<MultiAgentRun> {
    const header = await this.repo.getHeader(workspaceId, id);
    if (!header) throw new NotFoundError('Multi-agent run not found');
    const children = await this.repo.childRuns([id]);
    const evalCases = await this.repo.evalCasesForFindings(
      workspaceId,
      children.flatMap((c) => c.findings.map((f) => f.id)),
    );

    const columns: AgentColumn[] = children.map((c) => {
      const status = statusOf(c);
      return {
        run_id: c.runId,
        agent_id: c.agentId ?? '',
        agent_name: c.agentName ?? c.traceAgentName ?? '',
        status,
        queue_position: status === 'queued' ? this.container.reviewQueue.position(c.runId) : null,
        error: status === 'failed' ? (c.error ?? null) : null,
        provider: c.provider,
        model: c.model,
        verdict: c.verdict,
        score: c.score ?? c.reviewScore,
        summary: c.summary,
        started_at: c.startedAt ? c.startedAt.toISOString() : null,
        duration_ms: c.durationMs,
        tokens_in: c.tokensIn,
        tokens_out: c.tokensOut,
        cost_usd: c.costUsd,
        findings: c.findings.map((f) => findingRowToDto(f, evalCases.get(f.id))),
      };
    });

    const inputs: AgentRunInput[] = columns.map((col) => ({
      run_id: col.run_id,
      agent_id: col.agent_id,
      agent_name: col.agent_name,
      status: col.status,
      findings: col.findings,
    }));
    const groups = groupFindings(inputs);
    const totals = computeTotals(
      children.map((c, i) => ({
        status: columns[i]!.status,
        cost_usd: c.costUsd,
        finished_at: c.finishedAt,
      })),
      header.ranAt,
    );

    return {
      id: header.id,
      pr_id: header.prId,
      pr_number: header.prNumber,
      pr_title: header.prTitle,
      repo_id: header.repoId,
      ran_at: header.ranAt.toISOString(),
      agent_count: columns.length,
      in_progress: totals.in_progress,
      totals_partial: totals.totals_partial,
      total_duration_ms: totals.total_duration_ms,
      total_cost_usd: totals.total_cost_usd,
      columns,
      groups,
      conflicts: buildDisagreementRows(inputs, groups),
    };
  }

  /** Bare array, newest first (the client hook expects no wrapper). */
  async list(workspaceId: string, prId: string | undefined, limit: number): Promise<MultiAgentRunSummary[]> {
    const headers = await this.repo.listHeaders(workspaceId, prId, limit);
    const children = await this.repo.childRuns(headers.map((h) => h.id));
    return headers.map((h: MultiRunHeader) => {
      const own = children.filter((c) => c.multiAgentRunId === h.id);
      const statuses = own.map(statusOf);
      const totals = computeTotals(
        own.map((c, i) => ({ status: statuses[i]!, cost_usd: c.costUsd, finished_at: c.finishedAt })),
        h.ranAt,
      );
      return {
        id: h.id,
        pr_id: h.prId,
        pr_number: h.prNumber,
        pr_title: h.prTitle,
        repo_id: h.repoId,
        ran_at: h.ranAt.toISOString(),
        agent_count: own.length,
        status: overallStatus(statuses),
        total_duration_ms: totals.total_duration_ms,
        total_cost_usd: totals.total_cost_usd,
      };
    });
  }

  /** Cancel every queued/running child. Terminal children are untouched; all-terminal is a no-op. */
  async cancel(workspaceId: string, id: string): Promise<MultiAgentCancelResponse> {
    const header = await this.repo.getHeader(workspaceId, id);
    if (!header) throw new NotFoundError('Multi-agent run not found');
    const children = await this.repo.childRuns([id]);
    const active = children.filter((c) => {
      const s = statusOf(c);
      return s === 'queued' || s === 'running';
    });
    for (const c of active) await this.reviews.cancelRun(c.runId);
    return { cancelled_run_ids: active.map((c) => c.runId) };
  }

  async estimates(workspaceId: string): Promise<AgentEstimates> {
    const agents = await this.repo.enabledAgents(workspaceId);
    const estimates = await Promise.all(
      agents.map(async (a) =>
        computeAgentEstimate(
          { agent_id: a.id, agent_name: a.name },
          await this.repo.doneRunsForAgent(workspaceId, a.id, ESTIMATE_SAMPLE_SIZE),
        ),
      ),
    );
    return { review_concurrency: this.container.reviewQueue.limit, agents: estimates };
  }
}
