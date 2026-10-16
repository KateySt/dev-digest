/* hooks/conventions.ts — React Query hooks for the Conventions Lab page.
   Repo-scoped: candidates live under a repo, addressed by the active repo id
   from repo-context. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type {
  ConventionCandidate,
  ConventionStatus,
  CreateSkillFromConventionsInput,
  CreateSkillFromConventionsResult,
} from "@devdigest/shared";

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
  /** `skill_id: null` unlinks the convention from its skill (back to "ready"). */
  patch: { status?: ConventionStatus; rule?: string; skill_id?: null };
}

export function useUpdateConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: PatchConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["conventions", vars.repoId] }),
  });
}

/** Code the server returns when a selected convention was meanwhile used,
 *  un-accepted or removed (SPEC-2026-10-16-convention-skills AC-5/AC-6). */
export const CONVENTION_UNAVAILABLE = "convention_unavailable";

/** One skill from a selection of accepted, unused conventions; the server
 *  links them to it. The 409 is silenced globally — the modal shows it inline
 *  (AC-18) — and the list is refetched so the stale selection drops out. */
export function useCreateSkillFromConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, input }: { repoId: string; input: CreateSkillFromConventionsInput }) =>
      api.post<CreateSkillFromConventionsResult>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: (result, { repoId }) => {
      qc.setQueryData(["conventions", repoId], result.conventions);
      return qc.invalidateQueries({ queryKey: ["skills"] });
    },
    onError: (err, { repoId }) => {
      if (err instanceof ApiError && err.code === CONVENTION_UNAVAILABLE) {
        qc.invalidateQueries({ queryKey: ["conventions", repoId] });
      }
    },
    meta: { silentCodes: [CONVENTION_UNAVAILABLE] },
  });
}
