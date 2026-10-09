/* hooks/eval-cases.ts — backs the Agent Editor's Evals tab + the Eval Case
   Editor modal. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type {
  AgentEvalStats,
  EvalCase,
  EvalCaseKind,
  EvalCaseListItem,
  EvalCaseRun,
  EvalCaseTarget,
  EvalOwnerKind,
} from "@devdigest/shared";

const evalStatsPath = (ownerKind: EvalOwnerKind, ownerId: string) =>
  ownerKind === "agent" ? `/agents/${ownerId}/eval-stats` : `/skills/${ownerId}/eval-stats`;

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

export function useEvalStats(ownerKind: EvalOwnerKind, ownerId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-stats", ownerKind, ownerId],
    queryFn: () => api.get<AgentEvalStats>(evalStatsPath(ownerKind, ownerId!)),
    enabled: !!ownerId,
  });
}

/** The Evals tab header for an agent: latest completed suite run + deltas. */
export function useAgentEvalStats(agentId: string | null | undefined) {
  return useEvalStats("agent", agentId);
}

export interface CreateEvalCaseInput {
  kind?: EvalCaseKind;
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
      qc.invalidateQueries({ queryKey: ["eval-stats", ownerKind, ownerId] });
    },
  });
}

/** Result of "Turn into eval case": either a new case or the one that already
 *  existed for the finding (HTTP 409 is treated as success-like). */
export interface EvalCaseFromFinding {
  case_id: string;
  /** The created case; null when the finding already had one (409). */
  created: EvalCase | null;
  already_existed: boolean;
}

/** POST /findings/:id/eval-case — optionally for a `target` (the finding's
 *  agent by default, or a skill linked to it). A 409 carries the existing case
 *  id for THAT target in `error.details.case_id` and resolves like a success so
 *  the UI can show "In eval set" instead of an error.
 *
 *  A plain async function (not a mutation hook) on purpose: FindingCard calls
 *  it from an event handler and tracks the result in local state, which keeps
 *  the card render free of React Query context. Other screens pick the new
 *  case up on their next fetch (the Evals tab refetches on mount). */
export async function createEvalCaseFromFinding(
  findingId: string,
  target?: EvalCaseTarget,
): Promise<EvalCaseFromFinding> {
  try {
    const created = await api.post<EvalCase>(`/findings/${findingId}/eval-case`, target ? { target } : undefined);
    return { case_id: created.id, created, already_existed: false };
  } catch (err) {
    const details = err instanceof ApiError ? (err.details as { case_id?: string } | undefined) : undefined;
    if (err instanceof ApiError && err.status === 409 && details?.case_id) {
      return { case_id: details.case_id, created: null, already_existed: true };
    }
    throw err;
  }
}
