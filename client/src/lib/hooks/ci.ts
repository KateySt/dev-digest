/* hooks/ci.ts — backs the Agent Editor's CI tab, the Export to CI wizard, and
   the global CI Runs page. Response/request shapes come from
   `@devdigest/shared`; nothing is redeclared here. */
"use client";

import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  AgentCiOverview,
  CiExport,
  CiExportInputBody,
  CiPreview,
  CiRun,
  CiSyncResult,
  JenkinsConnection,
  JenkinsConnectionInput,
  JenkinsConnectionTestInput,
  JenkinsConnectionTestResult,
} from "@devdigest/shared";
import type { Paged } from "@/lib/types";
import { api } from "../api";

export type CiRunPeriod = "24h" | "7d" | "30d";

export interface CiRunFilters {
  period?: CiRunPeriod;
  agentId?: string;
  repo?: string;
  status?: string;
  source?: string;
  /** Opt-in server paging (1-based). */
  page?: number;
  perPage?: number;
}

export type CiRunPage = Paged<CiRun>;

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
    meta: {
      silentCodes: [
        "pat_workflow_scope",
        "github_repo_not_found",
        "github_forbidden",
        "external_service_error",
        "validation_error",
        "config_error",
        "ci_target_conflict",
        "trigger_not_supported",
        "jenkins_not_configured",
      ],
    },
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
  params.set("page", String(filters.page ?? 1));
  if (filters.perPage) params.set("per_page", String(filters.perPage));
  return useQuery({
    queryKey: ["ci-runs", filters],
    queryFn: () => api.get<CiRunPage>(`/ci-runs?${params.toString()}`),
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

// ---- per-repo Jenkins connection -----------------------------------------

const OWNER_NAME = /^[^/\s]+\/[^/\s]+$/;

export const jenkinsConnectionQueries = {
  all: () => ["jenkins-connection"] as const,
  detail: (repo: string) =>
    queryOptions({
      queryKey: ["jenkins-connection", repo.toLowerCase()],
      queryFn: () =>
        api.get<JenkinsConnection | null>(
          `/ci/jenkins-connection?repo=${encodeURIComponent(repo)}`,
        ),
    }),
};

/** The repo's Jenkins connection (never the token), or null. Idle until `repo` is `owner/name`. */
export function useJenkinsConnection(repo: string | null | undefined) {
  const valid = !!repo && OWNER_NAME.test(repo);
  return useQuery({ ...jenkinsConnectionQueries.detail(valid ? repo : ""), enabled: valid });
}

/** Save URL/username and (optionally) a new API token. The token never enters the cache. */
export function useSaveJenkinsConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: JenkinsConnectionInput) =>
      api.put<JenkinsConnection>("/ci/jenkins-connection", input),
    gcTime: 0,
    meta: { silentCodes: ["validation_error"] },
    onSuccess: (saved) => {
      qc.setQueryData(jenkinsConnectionQueries.detail(saved.repo).queryKey, saved);
      return qc.invalidateQueries({ queryKey: ["agent-ci"] });
    },
  });
}

/** Remove the repo's connection + token. Installations and runs are kept. */
export function useDeleteJenkinsConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repo }: { repo: string }) =>
      api.del<void>(`/ci/jenkins-connection?repo=${encodeURIComponent(repo)}`),
    onSuccess: (_data, { repo }) => {
      qc.setQueryData(jenkinsConnectionQueries.detail(repo).queryKey, null);
      return qc.invalidateQueries({ queryKey: ["agent-ci"] });
    },
  });
}

/** Click-only connection check (never from a mount effect). Writes nothing server-side. */
export function useTestJenkinsConnection() {
  return useMutation({
    mutationFn: (input: JenkinsConnectionTestInput) =>
      api.post<JenkinsConnectionTestResult>("/ci/jenkins-connection/test", input),
    gcTime: 0,
  });
}
