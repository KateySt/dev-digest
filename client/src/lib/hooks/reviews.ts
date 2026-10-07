/* hooks/reviews.ts — React Query + SSE hooks for the A2 reviewer.
   Run a review, stream RunEvents live, act on findings. */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "../api";
import { notify } from "../toast";
import type {
  BlastRadius,
  BulkReviewResponse,
  FindingActionKind,
  Intent,
  PrCommitHistory,
  PrHistory,
  PrReviewComment,
  ReviewEstimate,
  ReviewRecord,
  ReviewRunResponse,
  Risks,
  RunEvent,
  RunSummary,
  SmartDiff,
} from "@devdigest/shared";

// ---- Active (in-flight) runs — server-side source of truth ----
export interface ActiveRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
}

/** In-flight runs for a PR, from the server (agent_runs where status='running').
   Survives reloads/devices; polls while anything is running so it self-clears. */
export function usePrActiveRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-active-runs", prId],
    queryFn: () => api.get<ActiveRun[]>(`/pulls/${prId}/runs/active`),
    enabled: !!prId,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 4000 : false),
  });
}

// ---- Full run history for a PR (every agent_runs row, any status) ----
/** All runs for a PR — done, failed (with error), cancelled, running. Survives
   reload (DB-backed). Polls while anything is running so it self-updates. */
export function usePrRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-runs", prId],
    queryFn: () => api.get<RunSummary[]>(`/pulls/${prId}/runs`),
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? 4000 : false,
  });
}

// ---- Persisted reviews + findings for a PR ----
export function usePrReviews(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["reviews", prId],
    queryFn: () => api.get<ReviewRecord[]>(`/pulls/${prId}/reviews`),
    enabled: !!prId,
  });
}

// ---- Derived PR intent (computed + cached server-side, keyed by head sha) --
/** The PR's derived intent/scope — computed on first request by a separate
   cheap model, cached until the PR's head sha moves. */
export function useIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<Intent>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

// ---- Derived PR risk brief (computed + cached server-side, keyed by head sha) --
/** The PR's derived merge-risk brief — computed on first request by a
   separate cheap model, cached until the PR's head sha moves. Mirrors
   `useIntent`. */
export function useRisks(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-risks", prId],
    queryFn: () => api.get<Risks>(`/pulls/${prId}/risks`),
    enabled: !!prId,
  });
}

/** Force-refresh the PR's derived intent, bypassing the server's head-sha
   cache. Writes the fresh result straight into the `useIntent` cache entry —
   NOT `invalidateQueries`, which would just refetch via the plain (non-force)
   queryFn and hand back the same cached value. Part of `useRefreshPrBrief`. */
export function useForceIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.get<Intent>(`/pulls/${prId}/intent?force=true`),
    onSuccess: (data) => qc.setQueryData(["pr-intent", prId], data),
  });
}

/** Force-refresh the PR's derived risk brief, bypassing the server's head-sha
   cache. Mirrors `useForceIntent`. */
export function useForceRisks(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.get<Risks>(`/pulls/${prId}/risks?force=true`),
    onSuccess: (data) => qc.setQueryData(["pr-risks", prId], data),
  });
}

// ---- Derived PR blast radius (computed + cached server-side, keyed by head sha) --
/** The PR's derived blast radius — changed symbols, their downstream callers,
   and the endpoints/crons they reach. Computed on first request, cached until
   the PR's head sha moves. Unlike `useIntent`/`useRisks` this is NOT
   model-derived — it's a pure structural read over the repo-intel index
   (no LLM call on the server side). */
export function useBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

// ---- Prior PRs touching these files (no server-side caching) --------------
/** Other merged/closed PRs in the same repo that touched at least one file
   this PR also changed. Unlike `useBlast`/`useIntent`/`useRisks`, the server
   route does NOT cache this (a cheap live join, see `HistoryService`'s doc
   comment) — nothing to force-refresh, so this isn't part of
   `useRefreshPrBrief`'s chain either. */
export function usePrHistory(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-history", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/history`),
    enabled: !!prId,
  });
}

// ---- Commit history: commits → files → severity for the Overview tab ------
/** The PR's commits, each with the files it touched and the worst finding
   severity per file from the latest review. Commit→files is fetched from
   GitHub once per (repo, sha) and cached FOREVER server-side (a commit's
   file set never changes) — unlike `useIntent`/`useRisks`/`useBlast`, this is
   NOT keyed by head sha, and there's no `?force` refresh: nothing to
   invalidate. Deliberately not part of `useRefreshPrBrief`'s force-refresh
   chain for the same reason. */
export function usePrCommits(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-commits", prId],
    queryFn: () => api.get<PrCommitHistory>(`/pulls/${prId}/commits`),
    enabled: !!prId,
  });
}

// ---- Smart Diff: files grouped by role for the Files-changed tab ----------
/** Grouping/ordering only — every findings-derived bit of the diff-viewer UI
   (counters, dot indicator, inline cards) derives from `usePrReviews` instead,
   so it auto-updates after Run Review / accept-dismiss without waiting on
   this query too, and grouping still works before any review has run. */
export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}

/** Delete one run from the PR's run history (+ its trace). */
export function useDeleteRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.del<{ ok: boolean }>(`/runs/${runId}`),
    // Deleting a run also deletes the review it produced (server-side), so drop
    // both the timeline and the Review Runs list from cache.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
    },
  });
}

/** Request cancellation of an in-flight run (takes effect at the next step). */
export function useCancelRun() {
  return useMutation({
    mutationFn: (runId: string) => api.post<{ ok: boolean }>(`/runs/${runId}/cancel`),
  });
}

/** Delete a whole review run (one agent's pass) + its findings. */
export function useDeleteReview(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.del<{ ok: boolean }>(`/reviews/${reviewId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews", prId] }),
  });
}

// ---- Inline review comments on the "Files changed" tab (proxied to GitHub) --
/** Existing GitHub PR review comments, fetched live. */
export function usePrComments(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-comments", prId],
    queryFn: () => api.get<PrReviewComment[]>(`/pulls/${prId}/comments`),
    enabled: !!prId,
  });
}

export interface CreateCommentInput {
  path: string;
  line: number;
  side?: "LEFT" | "RIGHT";
  body: string;
  in_reply_to?: number;
}

/** Post one inline comment (or reply) to GitHub; refreshes the thread list. */
export function useCreatePrComment(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      api.post<PrReviewComment>(`/pulls/${prId}/comments`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pr-comments", prId] }),
  });
}

/** Edit an inline comment's body on GitHub; refreshes the thread list. */
export function useUpdatePrComment(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: number; body: string }) =>
      api.patch<PrReviewComment>(`/pulls/${prId}/comments/${commentId}`, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pr-comments", prId] }),
  });
}

/** Delete an inline comment from GitHub; refreshes the thread list. */
export function useDeletePrComment(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: number) => api.del<{ ok: boolean }>(`/pulls/${prId}/comments/${commentId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pr-comments", prId] }),
  });
}

// ---- Run a review (all enabled agents or a specific agent) ----
export interface RunReviewInput {
  prId: string;
  agentId?: string;
  all?: boolean;
}

export function useRunReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentId, all }: RunReviewInput) =>
      api.post<ReviewRunResponse>(`/pulls/${prId}/review`, {
        ...(agentId ? { agentId } : {}),
        ...(all ? { all } : {}),
      }),
    // 409 `review_in_progress` (server S-AC-23/24) is an expected outcome the
    // caller words itself (C-AC-34) — keep `providers.tsx` from also toasting
    // the raw server message.
    meta: { silentCodes: ["review_in_progress"] },
    // `pr-active-runs` / `pr-runs` too (C-AC-14): the PR list row's in-progress
    // state reads `usePrActiveRuns`, which sits idle (no polling) at `[]` until
    // something invalidates it after a run starts.
    onSuccess: (_d, { prId }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["reviews", prId] }),
        qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] }),
        qc.invalidateQueries({ queryKey: ["pr-runs", prId] }),
      ]),
  });
}

// ---- "Review all" (SPEC-05): estimate + bulk trigger over a repo's needs_review set ----
/** Pre-flight counts + approximate cost for "Review all". Read-only, starts
   nothing. Always refetched when the dialog opens (`enabled` flips true) so the
   confirm dialog never shows a remembered figure (cost safety NFR). */
export function useReviewEstimate(repoId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["review-estimate", repoId],
    queryFn: () => api.get<ReviewEstimate>(`/repos/${repoId}/pulls/review-estimate`),
    enabled: !!repoId && enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

/** Start a review on every `needs_review` PR in the repo. Sends NO body - the
   server derives the set (S-AC-1), so a client cannot widen the batch. The
   response carries one outcome per PR; rows whose run started get their
   in-flight state polled via `pr-active-runs`. */
export function useBulkReview(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BulkReviewResponse>(`/repos/${repoId}/pulls/review`),
    // The server's refusals (S-AC-5/6, no enabled agent) are worded inline by
    // the confirm dialog - keep `providers.tsx` from also toasting them.
    meta: { silentCodes: ["bulk_review_too_large", "nothing_to_review", "no_enabled_agents"] },
    onSuccess: ({ results }) =>
      Promise.all([
        ...results
          .filter((r) => r.outcome === "started")
          .flatMap((r) => [
            qc.invalidateQueries({ queryKey: ["pr-active-runs", r.pr_id] }),
            qc.invalidateQueries({ queryKey: ["pr-runs", r.pr_id] }),
          ]),
        qc.invalidateQueries({ queryKey: ["pulls", repoId] }),
      ]),
  });
}

/**
 * Orchestrates the Overview tab's "Refresh PR brief" action: force-refreshes
 * intent + risks (bypassing their head-sha caches), THEN re-runs the review
 * — deliberately sequential, not all three in parallel. Running the review
 * first (or concurrently) would let `run-executor.ts`'s own unforced
 * `IntentService.getOrCompute` call race the forced upsert above and
 * possibly read a stale row; awaiting the force-refreshes first also means
 * the review's internal intent lookup is a cheap cache-hit (the row is
 * already fresh by the time it runs).
 *
 * `Promise.allSettled` on the intent/risks pair means one failing doesn't
 * block the other (or the review re-run) from proceeding, but a genuine
 * failure must still surface as a rejected mutation — swallowing it would
 * hide it from `providers.tsx`'s global `MutationCache.onError` toast — so
 * any rejection is re-thrown (after the review call) as an aggregate error.
 */
export function useRefreshPrBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  const forceIntent = useForceIntent(prId);
  const forceRisks = useForceRisks(prId);

  const mutation = useMutation({
    mutationFn: async () => {
      const settled = await Promise.allSettled([forceIntent.mutateAsync(), forceRisks.mutateAsync()]);
      const review = await api.post<ReviewRunResponse>(`/pulls/${prId}/review`, { all: true });
      const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (rejected.length > 0) {
        throw new Error(
          `PR brief refresh partially failed: ${rejected
            .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)))
            .join("; ")}`,
        );
      }
      return review;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
    },
  });

  return { refresh: mutation.mutate, isPending: mutation.isPending };
}

// ---- Finding actions (accept/dismiss) ----
export function useFindingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      findingId,
      action,
      reply,
      prId: _prId,
    }: {
      findingId: string;
      action: FindingActionKind;
      reply?: string;
      prId?: string;
    }) =>
      api.post<{ finding: ReviewRecord["findings"][number]; memoryId?: string }>(
        `/findings/${findingId}/${action}`,
        reply ? { reply } : undefined,
      ),
    onSuccess: (_d, { prId }) => {
      if (prId) qc.invalidateQueries({ queryKey: ["reviews", prId] });
    },
  });
}

/** "Reply to author" - POST /findings/:id/reply posts `reply` verbatim as an
 *  inline GitHub comment and records its URL on the finding. Refreshes the
 *  PR's reviews so the card shows "Posted - View on GitHub". Errors propagate
 *  (the dialog shows the message and keeps the edited text). */
export function useReplyToFinding(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, reply }: { findingId: string; reply: string }) =>
      api.post<PrReviewComment>(`/findings/${findingId}/reply`, { reply }),
    onSuccess: () => {
      if (prId) qc.invalidateQueries({ queryKey: ["reviews", prId] });
    },
  });
}

/**
 * Subscribe to a run's SSE event stream. Returns the accumulated RunEvents and a
 * `running` flag (true until the stream closes). Live status for the
 * RunReviewDropdown / Live Log. Multiple runIds are subscribed in parallel.
 */
export function useRunEvents(runIds: string[]) {
  const [events, setEvents] = React.useState<RunEvent[]>([]);
  const [running, setRunning] = React.useState(false);
  const key = runIds.join(",");

  React.useEffect(() => {
    if (runIds.length === 0) return;
    setEvents([]);
    setRunning(true);
    const sources: EventSource[] = [];
    let open = runIds.length;

    for (const runId of runIds) {
      const es = new EventSource(`${API_BASE}/runs/${runId}/events`);
      const onMsg = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data) as RunEvent;
          setEvents((prev) => [...prev, parsed]);
          // Runtime agent failures arrive as SSE `error` events (not as a
          // mutation/query error), so the global error toast never sees them —
          // surface them here so the user gets a notification without a reload.
          if (parsed.kind === "error" && parsed.msg) notify.error(parsed.msg);
        } catch {
          /* ignore non-JSON keepalive frames (and dataless native error events) */
        }
      };
      // The server tags events with kind as the SSE `event:` name AND emits them
      // as default messages too in some clients — listen broadly.
      es.onmessage = onMsg;
      for (const kind of ["info", "tool", "result", "error"]) {
        es.addEventListener(kind, onMsg as EventListener);
      }
      es.onerror = () => {
        es.close();
        open -= 1;
        if (open <= 0) setRunning(false);
      };
      sources.push(es);
    }

    return () => {
      for (const es of sources) es.close();
      setRunning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { events, running };
}
