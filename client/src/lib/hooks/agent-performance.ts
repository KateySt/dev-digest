/* hooks/agent-performance.ts — backs the Agent Editor's Stats tab and the
   global Agent Performance page (one feature, two surfaces). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentPerf, AgentStats, RunSummary } from "@devdigest/shared";

export function useAgentStats(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-stats", agentId],
    queryFn: () => api.get<AgentStats>(`/agents/${agentId}/stats`),
    enabled: !!agentId,
  });
}

export function useAgentRuns(agentId: string | null | undefined, limit?: number) {
  return useQuery({
    queryKey: ["agent-runs", agentId, limit],
    queryFn: () => api.get<RunSummary[]>(`/agents/${agentId}/runs${limit ? `?limit=${limit}` : ""}`),
    enabled: !!agentId,
  });
}

/** Workspace-wide rollup — call ONCE at the agents-list level and look up
 *  each agent's row by id, rather than one `useAgentStats` per card. */
export function useAgentPerformance() {
  return useQuery({
    queryKey: ["agent-performance"],
    queryFn: () => api.get<AgentPerf>("/agents/performance"),
  });
}
