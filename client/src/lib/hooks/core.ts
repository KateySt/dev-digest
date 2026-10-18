/* hooks/core.ts — typed React Query hooks over the F1 API (contracts):
   settings, secrets, repos, and pulls. Project Context hooks live in
   hooks/project-context.ts (see that file's header for why they were split
   out of here). Scaffolding screens use these; feature-domain hooks live in
   the sibling files (agents/reviews/trace/…) and are re-exported alongside
   these from hooks/index.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Settings,
  SettingsUpdate,
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  Repo,
  PrMeta,
  PrDetail,
} from "../types";

// ---- Settings (F1: GET/PUT /settings, POST /settings/test-connection) ----
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>("/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsUpdate) => api.put<Settings>("/settings", patch),
    onSuccess: (data) => qc.setQueryData(["settings"], data),
  });
}

/**
 * Save the `keybindings` pref (SPEC-11) — a passthrough settings key whose
 * shape is owned by `@/components/keyboard`. The cache is written
 * synchronously before the request so a rebind applies at once; a failed
 * save restores the previous value (the global mutation toast reports it).
 */
export function useSaveKeybindings() {
  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationKey: ["settings", "keybindings"],
    scope: { id: "settings-keybindings" },
    mutationFn: ({ value }: { value: unknown; previous: unknown }) =>
      api.put<Settings>("/settings", { keybindings: value }),
    onMutate: () => qc.cancelQueries({ queryKey: ["settings"] }),
    onSuccess: (data) => qc.setQueryData(["settings"], data),
    onError: (_err, { previous }) =>
      qc.setQueryData<Settings>(["settings"], (s) => (s ? { ...s, keybindings: previous } : s)),
  });
  const save = (value: unknown) => {
    const previous = qc.getQueryData<Settings>(["settings"])?.keybindings;
    qc.setQueryData<Settings>(["settings"], (s) => ({ ...(s ?? ({} as Settings)), keybindings: value }));
    mutate({ value, previous });
  };
  return { save, isPending };
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnTestProvider | { provider: ConnTestProvider; key?: string }) => {
      const body = typeof input === "string" ? { provider: input } : input;
      return api.post<ConnTestResult>("/settings/test-connection", body);
    },
    // Saving/validating a provider key can change which models resolve — drop the
    // cached (possibly empty) model lists so the agent picker refetches, and
    // refresh the "Configured / Not set" key-status badges.
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["provider-models"] });
        qc.invalidateQueries({ queryKey: ["secrets-status"] });
        // A new/verified GitHub token can change who the active user is.
        if (res.provider === "github") qc.invalidateQueries({ queryKey: ["github-account"] });
      }
    },
  });
}

/** Which provider keys are configured (booleans only — never the values). */
export function useSecretsStatus() {
  return useQuery({
    queryKey: ["secrets-status"],
    queryFn: () => api.get<SecretsStatus>("/settings/secrets-status"),
    staleTime: 30_000,
  });
}

/** The GitHub account behind the configured token (the app's active user). */
// TODO: move to @devdigest/shared once the vendored contracts are re-synced.
export interface GithubAccount {
  login: string;
  avatar_url: string;
  html_url: string;
}

/** `account` is null when no GitHub token is set or GitHub rejects it. */
export function useGithubAccount() {
  return useQuery({
    queryKey: ["github-account"],
    queryFn: () => api.get<{ account: GithubAccount | null }>("/settings/github-account"),
    // Changes only when the token does (useTestConnection invalidates it).
    staleTime: 5 * 60_000,
  });
}

// ---- Repos (F1: GET/POST /repos, refresh, delete) ----
export function useRepos() {
  return useQuery({
    queryKey: ["repos"],
    queryFn: () => api.get<Repo[]>("/repos"),
  });
}

export function useAddRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.post<Repo>("/repos", { url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repos"] }),
  });
}

export function useRefreshRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<Repo>(`/repos/${repoId}/refresh`),
    onSuccess: (_d, repoId) => {
      qc.invalidateQueries({ queryKey: ["repos"] });
      qc.invalidateQueries({ queryKey: ["pulls", repoId] });
    },
  });
}

export function useDeleteRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.del<{ deleted: string }>(`/repos/${repoId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repos"] }),
  });
}

// ---- Pull requests (F1: GET /repos/:id/pulls, GET /pulls/:id) ----
export function usePulls(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["pulls", repoId],
    queryFn: () => api.get<PrMeta[]>(`/repos/${repoId}/pulls`),
    enabled: !!repoId,
    // Auto-refresh PR statuses: re-sync from GitHub every 60s while the page is
    // open, and whenever the window regains focus.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function usePullDetail(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["pull", prId],
    queryFn: () => api.get<PrDetail>(`/pulls/${prId}`),
    enabled: prId != null,
  });
}
