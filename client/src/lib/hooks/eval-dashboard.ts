/* hooks/eval-dashboard.ts — backs the global Eval Dashboard page. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { EvalCaseRun, EvalRun } from "@devdigest/shared";

export interface EvalTrendPoint {
  label: string;
  recall: number;
  precision: number;
  citation: number;
}

/** GET /eval-dashboard's response. Not a shared contract type — workspace-
 *  wide ad-hoc summary, only consumed here. */
export interface EvalDashboard {
  cases_total: number;
  runs_total: number;
  trend: EvalTrendPoint[];
  recent_runs: (EvalCaseRun & { case_name: string })[];
}

export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalDashboard>("/eval-dashboard"),
  });
}

export function useRunAllEvals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRun>("/eval-dashboard/run-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-dashboard"] }),
  });
}
