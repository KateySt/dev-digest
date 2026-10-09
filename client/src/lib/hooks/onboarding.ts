/* hooks/onboarding.ts — React Query hooks for SPEC-06 (Onboarding Tour),
   mirroring hooks/repo-intel.ts's shape:
     GET  /repos/:id/onboarding           → OnboardingReadResult
     POST /repos/:id/onboarding/generate  → accepted + jobId (202), the
                                             same "generate" path also used
                                             for Regenerate.

   Completion is detected by `generated_at` ADVANCING, not a status enum —
   same reason `useRepoIntelStatus` watches `lastIndexedSha`: the read
   response has no terminal-only status field to poll against, and a
   degraded tour is still a "completed" generation. Polling only runs while
   a generation is in flight (the caller passes `poll`); the previously
   fetched tour stays in cache throughout (TanStack Query never clears
   `data` on a background refetch), so a failed generate request never
   discards what's on screen (C-AC-24). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingReadResponse, OnboardingGenerateAccepted } from "../types";

function queryKey(repoId: string | null | undefined) {
  return ["onboarding-tour", repoId];
}

/** GET /repos/:id/onboarding. While `poll` is true, refetch on an interval
 *  so an in-flight generation's completion becomes visible without a manual
 *  reload (C-AC-23). The caller (OnboardingView) owns when to stop polling. */
export function useOnboardingTour(repoId: string | null | undefined, poll = false) {
  return useQuery({
    queryKey: queryKey(repoId),
    queryFn: () => api.get<OnboardingReadResponse>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: poll ? 2000 : false,
  });
}

/** POST /repos/:id/onboarding/generate — the Generate AND Regenerate action
 *  (same endpoint; the page already has a tour or not). Never invalidates
 *  the read query on success — a 202 carries no new tour yet, only a job
 *  id, and invalidating here would risk a brief "loading" flash over a
 *  perfectly good previous tour (C-AC-21). The caller starts polling
 *  `useOnboardingTour` instead. */
export function useGenerateOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingGenerateAccepted>(`/repos/${repoId}/onboarding/generate`),
    onSettled: () => {
      // Nudge a refetch once the request itself settles (accepted or
      // failed) so a fast-completing degraded generation isn't missed
      // before polling's first interval fires.
      qc.invalidateQueries({ queryKey: queryKey(repoId) });
    },
  });
}
