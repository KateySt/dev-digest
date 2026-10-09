/* hooks/conventions.ts — React Query hooks for the Conventions Lab page.
   Repo-scoped: candidates live under a repo, addressed by the active repo id
   from repo-context. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** (Re-)scan the repo. Replaces every NOT-accepted candidate (pending or
 *  rejected) server-side; previously accepted ones survive — see the
 *  server's `extract()` doc. */
export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data, repoId) => qc.setQueryData(["conventions", repoId], data),
  });
}

export interface PatchConventionInput {
  repoId: string;
  id: string;
  patch: { status?: ConventionStatus; rule?: string };
}

export function useUpdateConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: PatchConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["conventions", vars.repoId] }),
  });
}
