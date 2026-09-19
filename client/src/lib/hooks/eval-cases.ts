/* hooks/eval-cases.ts — backs the Agent Editor's Evals tab + the Eval Case
   Editor modal. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { EvalCase, EvalCaseListItem, EvalCaseRun, EvalOwnerKind } from "@devdigest/shared";

/** The Evals tab's header rollup — GET /agents/:id/eval-stats. Not a shared
 *  contract type (ad-hoc aggregate, display-only, no cross-module reuse). */
export interface AgentEvalStats {
  cases_total: number;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  cases_evaluated: number;
}

export function useEvalCases(ownerKind: EvalOwnerKind, ownerId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", ownerKind, ownerId],
    queryFn: () => api.get<EvalCaseListItem[]>(`/eval-cases?owner_kind=${ownerKind}&owner_id=${ownerId}`),
    enabled: !!ownerId,
  });
}

export function useEvalCase(id: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case", id],
    queryFn: () => api.get<EvalCase>(`/eval-cases/${id}`),
    enabled: !!id,
  });
}

export function useAgentEvalStats(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-eval-stats", agentId],
    queryFn: () => api.get<AgentEvalStats>(`/agents/${agentId}/eval-stats`),
    enabled: !!agentId,
  });
}

export interface CreateEvalCaseInput {
  owner_kind: EvalOwnerKind;
  owner_id: string;
  name: string;
  input_diff?: string;
  input_meta?: unknown;
  expected_output?: unknown;
  notes?: string;
}

export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEvalCaseInput) => api.post<EvalCase>("/eval-cases", input),
    onSuccess: (data) =>
      qc.invalidateQueries({ queryKey: ["eval-cases", data.owner_kind, data.owner_id] }),
  });
}

export interface UpdateEvalCaseInput {
  id: string;
  patch: Partial<Pick<EvalCase, "name" | "input_diff" | "input_meta" | "expected_output" | "notes">>;
  ownerKind: EvalOwnerKind;
  ownerId: string;
}

export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateEvalCaseInput) => api.put<EvalCase>(`/eval-cases/${id}`, patch),
    onSuccess: (data, { ownerKind, ownerId }) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", ownerKind, ownerId] });
      qc.setQueryData(["eval-case", data.id], data);
    },
  });
}

export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; ownerKind: EvalOwnerKind; ownerId: string }) =>
      api.del<{ ok: boolean }>(`/eval-cases/${id}`),
    onSuccess: (_d, { ownerKind, ownerId }) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", ownerKind, ownerId] });
    },
  });
}

export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; ownerKind: EvalOwnerKind; ownerId: string }) =>
      api.post<EvalCaseRun>(`/eval-cases/${id}/run`),
    onSuccess: (_d, { ownerKind, ownerId }) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", ownerKind, ownerId] });
      qc.invalidateQueries({ queryKey: ["agent-eval-stats", ownerId] });
    },
  });
}
