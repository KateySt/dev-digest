/* hooks/agent-performance.ts — backs the Agent Editor's Stats tab and the
   global Agent Performance page (one feature, two surfaces). */
"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentPerf, AgentStats, RunSummary } from "@devdigest/shared";
import type { Paged } from "@/lib/types";

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

/** One page of an agent's run history (Stats tab), previous page kept while the next loads. */
export function useAgentRunsPage(agentId: string | null | undefined, page: number, perPage: number) {
  return useQuery({
    queryKey: ["agent-runs", agentId, "page", page, perPage],
    queryFn: () => api.get<Paged<RunSummary>>(`/agents/${agentId}/runs?page=${page}&per_page=${perPage}`),
    enabled: !!agentId,
    placeholderData: keepPreviousData,
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
