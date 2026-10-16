/* hooks/activity.ts — what is running right now (GET /activity). Only the
   desktop app polls it: it drives the taskbar progress and the tray status. */
"use client";

import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

// TODO: move to @devdigest/shared once the vendored contracts are re-synced.
export interface Activity {
  reviews_running: number;
  evals_running: number;
}

/** While something runs, notice it finishing quickly; idle, notice a new start
   within a few seconds (starts come from many mutations — polling beats
   wiring an invalidation into each of them). */
export const ACTIVITY_BUSY_POLL_MS = 3_000;
export const ACTIVITY_IDLE_POLL_MS = 5_000;

export const activityQueries = {
  current: () =>
    queryOptions({
      queryKey: ["activity"],
      queryFn: () => api.get<Activity>("/activity"),
      refetchInterval: (q) =>
        q.state.data && q.state.data.reviews_running + q.state.data.evals_running > 0
          ? ACTIVITY_BUSY_POLL_MS
          : ACTIVITY_IDLE_POLL_MS,
    }),
};

export function useActivity(enabled: boolean) {
  return useQuery({ ...activityQueries.current(), enabled });
}

/** A finished-operation notification means a count just dropped — refresh now. */
export function useInvalidateActivity() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: activityQueries.current().queryKey });
}
