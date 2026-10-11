/* hooks/multi-agent.ts — multi-agent review (SPEC-10): start a run with N
   agents, poll the results, list past runs, cancel, per-agent estimates. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type {
  AgentEstimates,
  MultiAgentCancelResponse,
  MultiAgentRun,
  MultiAgentRunSummary,
  ReviewRunResponse,
} from "@devdigest/shared";

/** Review polling cadence (spec ceiling for review runs). */
export const MULTI_AGENT_POLL_MS = 4000;

/** One multi-run's results. Polls every 4 s while `in_progress`; stops once
   terminal. A 404 (unknown / other-workspace id) is not retried so the page
   can show its not-found state straight away. */
export function useMultiAgentRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run", id],
    queryFn: () => api.get<MultiAgentRun>(`/multi-agent-runs/${id}`),
    enabled: !!id,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
    refetchInterval: (query) => (query.state.data?.in_progress ? MULTI_AGENT_POLL_MS : false),
  });
}

/** Past multi-runs, newest first (server default limit 10), optionally for one PR. */
export function useMultiAgentRuns(limit = 10, prId?: string | null) {
  return useQuery({
    queryKey: ["multi-agent-runs", prId ?? null, limit],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (prId) qs.set("pr_id", prId);
      return api.get<MultiAgentRunSummary[]>(`/multi-agent-runs?${qs.toString()}`);
    },
  });
}

/** Per-agent mean duration/cost estimates + the effective queue limit. */
export function useAgentEstimates() {
  return useQuery({
    queryKey: ["multi-agent-estimates"],
    queryFn: () => api.get<AgentEstimates>("/multi-agent-runs/estimates"),
  });
}

export interface StartMultiRunInput {
  prId: string;
  agentIds: string[];
}

/** Start a multi-agent review (POST /pulls/:id/review {agentIds}). The 409
   `review_in_progress` refusal is worded by the caller (read `ApiError.details`
   for the in-flight run ids / multi_agent_run_id), so it is not toasted. */
export function useStartMultiRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: StartMultiRunInput) =>
      api.post<ReviewRunResponse>(`/pulls/${prId}/review`, { agentIds }),
    meta: { silentCodes: ["review_in_progress"] },
    onSuccess: (_d, { prId }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] }),
        qc.invalidateQueries({ queryKey: ["pr-runs", prId] }),
        qc.invalidateQueries({ queryKey: ["reviews", prId] }),
        qc.invalidateQueries({ queryKey: ["multi-agent-runs"] }),
      ]),
  });
}

/** Cancel every queued/running child of a multi-run. */
export function useCancelMultiRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (multiRunId: string) =>
      api.post<MultiAgentCancelResponse>(`/multi-agent-runs/${multiRunId}/cancel`),
    onSuccess: (_d, multiRunId) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["multi-agent-run", multiRunId] }),
        qc.invalidateQueries({ queryKey: ["multi-agent-runs"] }),
        qc.invalidateQueries({ queryKey: ["pr-active-runs"] }),
        qc.invalidateQueries({ queryKey: ["pr-runs"] }),
      ]),
  });
}
