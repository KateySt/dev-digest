/* hooks/eval-runs.ts — versioned suite runs: start, poll progress, per-agent
   history (range-filtered), compare. Backs the Evals tab and the per-agent
   dashboard. */
"use client";

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { EVAL_POLL_MS } from "./eval-dashboard";
import type {
  AgentEvalRuns,
  EvalCompare,
  EvalRange,
  EvalSuiteRunDetail,
  StartEvalRunResponse,
} from "@devdigest/shared";

/** Everything a started/finished run can change for an agent. */
function useInvalidateAgentEval() {
  const qc = useQueryClient();
  return (agentId: string) => {
    qc.invalidateQueries({ queryKey: ["eval-stats", "agent", agentId] });
    qc.invalidateQueries({ queryKey: ["eval-cases", "agent", agentId] });
    qc.invalidateQueries({ queryKey: ["agent-eval-runs", agentId] });
    qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    qc.invalidateQueries({ queryKey: ["agent", agentId] });
  };
}

/** POST /agents/:id/eval-runs — starts a background suite run (202). */
export function useStartAgentEvalRun() {
  const invalidate = useInvalidateAgentEval();
  return useMutation({
    mutationFn: (agentId: string) => api.post<StartEvalRunResponse>(`/agents/${agentId}/eval-runs`),
    onSuccess: (_d, agentId) => invalidate(agentId),
  });
}

/** GET /eval-suite-runs/:id — progress + per-case results. Polls every 2s
 *  while the run is `running`, stops when it completes/fails, and refreshes the
 *  agent's stats/cases/history once on that transition (no page reload). */
export function useEvalSuiteRun(runId: string | null | undefined, agentId?: string | null) {
  const invalidate = useInvalidateAgentEval();
  const query = useQuery({
    queryKey: ["eval-suite-run", runId],
    queryFn: () => api.get<EvalSuiteRunDetail>(`/eval-suite-runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (q) => (q.state.data?.status === "running" ? EVAL_POLL_MS : false),
  });

  const status = query.data?.status;
  const wasRunning = useRef(false);
  useEffect(() => {
    if (status === "running") {
      wasRunning.current = true;
    } else if (status && wasRunning.current) {
      wasRunning.current = false;
      if (agentId) invalidate(agentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, agentId]);

  return query;
}

/** GET /agents/:id/eval-runs?range= — range-filtered runs (newest first),
 *  all-time history for cards/sparklines, regression alert. Polls while any
 *  listed run is still running so the table updates live. */
export function useAgentEvalRuns(agentId: string | null | undefined, range: EvalRange) {
  return useQuery({
    queryKey: ["agent-eval-runs", agentId, range],
    queryFn: () => api.get<AgentEvalRuns>(`/agents/${agentId}/eval-runs?range=${range}`),
    enabled: !!agentId,
    refetchInterval: (q) =>
      (q.state.data?.runs ?? []).some((r) => r.status === "running") ? EVAL_POLL_MS : false,
  });
}

/** GET /agents/:id/eval-runs/compare?base&head — enabled once both ids exist. */
export function useEvalCompare(
  agentId: string | null | undefined,
  baseRunId: string | null | undefined,
  headRunId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["eval-compare", agentId, baseRunId, headRunId],
    queryFn: () =>
      api.get<EvalCompare>(`/agents/${agentId}/eval-runs/compare?base=${baseRunId}&head=${headRunId}`),
    enabled: !!agentId && !!baseRunId && !!headRunId,
  });
}
