/* hooks/ci.ts — backs the Agent Editor's CI tab, the Export to CI wizard, and
   the global CI Runs page. Response/request shapes come from
   `@devdigest/shared`; nothing is redeclared here. */
"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AgentCiOverview,
  CiExport,
  CiExportInputBody,
  CiPreview,
  CiRun,
  CiSyncResult,
} from "@devdigest/shared";
import { api } from "../api";

export type CiRunPeriod = "24h" | "7d" | "30d";

export interface CiRunFilters {
  period?: CiRunPeriod;
  agentId?: string;
  repo?: string;
  status?: string;
  source?: string;
}

/** Installations + recent runs for one agent (CI tab). */
export function useAgentCi(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-ci", agentId],
    queryFn: () => api.get<AgentCiOverview>(`/agents/${agentId}/ci`),
    enabled: !!agentId,
  });
}

/** Server preview (no side effects). A mutation because it POSTs the repo,
 *  triggers and — when edited — the workflow text to lint. */
export function useCiPreview() {
  return useMutation({
    mutationFn: ({ agentId, input }: { agentId: string; input: CiExportInputBody }) =>
      api.post<CiPreview>(`/agents/${agentId}/ci/preview`, input),
    // The wizard renders lint violations (422 details) inline.
    meta: { silentCodes: ["validation_error"] },
  });
}

/** Commit to `devdigest/ci` and open/reuse the PR. Refreshes the CI tab + CI Runs. */
export function useExportCi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, input }: { agentId: string; input: CiExportInputBody }) =>
      api.post<CiExport>(`/agents/${agentId}/ci/export`, input),
    // The wizard shows the server message (incl. `pat_workflow_scope`) inline.
    meta: { silentCodes: ["pat_workflow_scope", "github_repo_not_found", "github_forbidden", "external_service_error", "validation_error", "config_error"] },
    onSuccess: (_data, { agentId }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["agent-ci", agentId] }),
        qc.invalidateQueries({ queryKey: ["ci-runs"] }),
      ]),
  });
}

/** Fetch the zip as a Blob. Creates no installation, so it invalidates nothing. */
export function useDownloadCiZip() {
  return useMutation({
    mutationFn: ({ agentId, input }: { agentId: string; input: CiExportInputBody }) =>
      api.postBlob(`/agents/${agentId}/ci/zip`, input),
  });
}

/** Pull + verify + ingest completed CI runs, then refresh the lists. */
export function useSyncCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CiSyncResult>("/ci-runs/sync"),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["ci-runs"] }),
        qc.invalidateQueries({ queryKey: ["agent-ci"] }),
      ]),
  });
}

export function useCiRuns(filters: CiRunFilters = {}) {
  const params = new URLSearchParams();
  if (filters.period) params.set("period", filters.period);
  if (filters.agentId) params.set("agent_id", filters.agentId);
  if (filters.repo) params.set("repo", filters.repo);
  if (filters.status) params.set("status", filters.status);
  if (filters.source) params.set("source", filters.source);
  const qs = params.toString();
  return useQuery({
    queryKey: ["ci-runs", filters],
    queryFn: () => api.get<CiRun[]>(`/ci-runs${qs ? `?${qs}` : ""}`),
    placeholderData: keepPreviousData,
  });
}

/** Repos with at least one installation (CI Runs repo filter). */
export function useCiRepos() {
  return useQuery({
    queryKey: ["ci-runs", "repos"],
    queryFn: () => api.get<string[]>("/ci-runs/repos"),
  });
}

/** For components that change something affecting an agent's installations
 *  (e.g. Fail CI on): refetch the CI tab data without hard-coding the key. */
export function useInvalidateAgentCi() {
  const qc = useQueryClient();
  return (agentId: string) => qc.invalidateQueries({ queryKey: ["agent-ci", agentId] });
}
