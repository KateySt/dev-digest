/* hooks/eval-dashboard.ts — backs the cross-agent Eval Dashboard (/eval). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { EvalCrossAgentDashboard, RunAllAgentsResponse } from "@devdigest/shared";

/** Polling interval (ms) while any suite run is running (spec: at most every 2s). */
export const EVAL_POLL_MS = 2000;

/** GET /eval-dashboard — per-agent latest run + history + running state. Polls
 *  while any agent's suite run is running and stops once none is. */
export function useEvalCrossDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalCrossAgentDashboard>("/eval-dashboard"),
    refetchInterval: (query) =>
      (query.state.data?.agents ?? []).some((a) => a.running_run) ? EVAL_POLL_MS : false,
  });
}

/** "Run all agents" — POST /eval-dashboard/run-all (202 { started, skipped }). */
export function useRunAllAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RunAllAgentsResponse>("/eval-dashboard/run-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-dashboard"] }),
  });
}
