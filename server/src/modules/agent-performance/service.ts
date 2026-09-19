import type { Container } from '../../platform/container.js';
import type { AgentPerf, AgentStats, RunSummary } from '@devdigest/shared';
import { AgentPerformanceRepository } from './repository.js';
import { computeAggregate, costSegments, toAgentPerfRow, toAgentStats, toRunSummary } from './helpers.js';
import { DEFAULT_RUNS_LIMIT } from './constants.js';

/**
 * A1-adjacent — agent-performance service. Backs the Agent Editor's Stats tab
 * and the global Agent Performance page (confirmed with the user: one
 * feature, two surfaces sharing this aggregation).
 */
export class AgentPerformanceService {
  private repo: AgentPerformanceRepository;

  constructor(private container: Container) {
    this.repo = new AgentPerformanceRepository(container.db);
  }

  /** GET /agents/:id/stats. Returns undefined when the agent isn't in this
   *  workspace (route maps that to 404). */
  async statsForAgent(workspaceId: string, agentId: string): Promise<AgentStats | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const [runs, findings] = await Promise.all([
      this.repo.runsForAgent(workspaceId, agentId),
      this.repo.findingOutcomesForAgent(workspaceId, agentId),
    ]);
    return toAgentStats(agent.id, agent.name, runs, findings);
  }

  /** GET /agents/:id/runs. Returns undefined when the agent isn't in this
   *  workspace (route maps that to 404). */
  async runsForAgent(workspaceId: string, agentId: string, limit = DEFAULT_RUNS_LIMIT): Promise<RunSummary[] | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.recentRunsForAgent(workspaceId, agentId, limit);
    return rows.map(toRunSummary);
  }

  /** GET /agents/performance — workspace-wide rollup for the global page. */
  async performanceForWorkspace(workspaceId: string): Promise<AgentPerf> {
    const [agents, runs, findings] = await Promise.all([
      this.container.agentsRepo.list(workspaceId),
      this.repo.runsForWorkspace(workspaceId),
      this.repo.findingOutcomesForWorkspace(workspaceId),
    ]);

    const runsByAgent = new Map<string, typeof runs>();
    for (const run of runs) {
      if (!run.agentId) continue;
      const list = runsByAgent.get(run.agentId) ?? [];
      list.push(run);
      runsByAgent.set(run.agentId, list);
    }
    const findingsByAgent = new Map<string, typeof findings>();
    for (const f of findings) {
      if (!f.agentId) continue;
      const list = findingsByAgent.get(f.agentId) ?? [];
      list.push(f);
      findingsByAgent.set(f.agentId, list);
    }

    const rows = agents.map((agent) =>
      toAgentPerfRow(agent, runsByAgent.get(agent.id) ?? [], findingsByAgent.get(agent.id) ?? []),
    );

    // Workspace-wide accept-rate is computed directly over ALL findings, not
    // averaged per-agent — averaging per-agent rates would let a low-volume
    // agent's noisy rate skew the headline number as much as a high-volume one.
    const workspaceAggregate = computeAggregate(runs, findings);
    const mostActive = rows.length > 0 ? rows.reduce((a, b) => (a.runs >= b.runs ? a : b)) : undefined;

    const pricedRuns = runs.filter((r) => r.costUsd != null && r.agentId);
    const agentNameById = new Map(agents.map((a) => [a.id, a.name]));
    const costByAgent = costSegments(
      pricedRuns.map((r) => ({ label: agentNameById.get(r.agentId!) ?? 'Unknown', value: r.costUsd! })),
    );
    const costByModel = costSegments(
      pricedRuns.map((r) => ({ label: r.model ?? 'Unknown', value: r.costUsd! })),
    );

    return {
      summary: {
        runs: runs.length,
        total_cost_usd: workspaceAggregate.total_cost_usd,
        avg_accept_rate: workspaceAggregate.accept_rate,
        most_active_agent: mostActive && mostActive.runs > 0 ? mostActive.agent_name : null,
      },
      agents: rows,
      cost_by_agent: costByAgent,
      cost_by_model: costByModel,
    };
  }
}
