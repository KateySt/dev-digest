/* hooks/ci.ts — backs the Agent Editor's CI tab, the Publish dialog, and the
   global CI Runs page. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface CiInstallation {
  id: string;
  repo: string;
  target_type: string;
  installed_at: string;
}

export interface CiFile {
  path: string;
  content: string;
}

export interface CiPublishResult {
  url: string;
  republished: boolean;
  installed_at: string;
}

export interface CiRun {
  id: string;
  agent_id: string | null;
  agent_name: string | null;
  repo: string | null;
  pr_number: number | null;
  ran_at: string | null;
  status: string | null;
  findings_count: number | null;
  cost_usd: number | null;
  github_url: string | null;
  source: string | null;
}

export function useAgentCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-ci", agentId],
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci`),
    enabled: !!agentId,
  });
}

export function useCiPreview(agentId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["agent-ci-preview", agentId],
    queryFn: () => api.get<CiFile[]>(`/agents/${agentId}/ci/preview`),
    enabled: !!agentId && enabled,
  });
}

export function usePublishCi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, repo }: { agentId: string; repo: string }) =>
      api.post<CiPublishResult>(`/agents/${agentId}/ci/publish`, { repo }),
    onSuccess: (_data, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-ci", agentId] });
    },
  });
}

export interface CiRunFilters {
  agentId?: string;
  repo?: string;
  status?: string;
  since?: string;
}

export function useCiRuns(filters: CiRunFilters = {}) {
  const params = new URLSearchParams();
  if (filters.agentId) params.set("agent_id", filters.agentId);
  if (filters.repo) params.set("repo", filters.repo);
  if (filters.status) params.set("status", filters.status);
  if (filters.since) params.set("since", filters.since);
  const qs = params.toString();
  return useQuery({
    queryKey: ["ci-runs", filters],
    queryFn: () => api.get<CiRun[]>(`/ci-runs${qs ? `?${qs}` : ""}`),
  });
}
