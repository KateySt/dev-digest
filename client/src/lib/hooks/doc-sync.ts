/* hooks/doc-sync.ts — Docs Sync (server/specs/doc-sync.md):
     GET/PUT /doc-sync/schedule   → DocSyncSchedule
     POST    /doc-sync/run        → DocSyncRun (202)
     GET     /doc-sync/runs       → DocSyncRun[] (polled while one is running)
     GET     /doc-sync/repos      → DocSyncRepo[]
     PATCH   /repos/:id/doc-sync  → DocSyncRepo */
"use client";

import { useEffect, useRef } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DocSyncRepo,
  DocSyncRepoUpdate,
  DocSyncRun,
  DocSyncSchedule,
  DocSyncScheduleUpdate,
} from "@devdigest/shared";
import { api } from "../api";

const RUNS_POLL_MS = 3000;

export const docSyncQueries = {
  schedule: () =>
    queryOptions({ queryKey: ["doc-sync-schedule"], queryFn: () => api.get<DocSyncSchedule>("/doc-sync/schedule") }),
  runs: () => queryOptions({ queryKey: ["doc-sync-runs"], queryFn: () => api.get<DocSyncRun[]>("/doc-sync/runs") }),
  repos: () => queryOptions({ queryKey: ["doc-sync-repos"], queryFn: () => api.get<DocSyncRepo[]>("/doc-sync/repos") }),
};

export const useDocSyncSchedule = () => useQuery(docSyncQueries.schedule());

export function useUpdateDocSyncSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DocSyncScheduleUpdate) => api.put<DocSyncSchedule>("/doc-sync/schedule", body),
    onSuccess: (saved) => qc.setQueryData(docSyncQueries.schedule().queryKey, saved),
  });
}

/** Latest runs; polls while one is running. When a run finishes, the repos'
 *  "last checked" and the schedule's last/next run are refreshed once. */
export function useDocSyncRuns() {
  const qc = useQueryClient();
  const query = useQuery({
    ...docSyncQueries.runs(),
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? RUNS_POLL_MS : false),
  });
  const latest = query.data?.[0];
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!latest || latest.status === "running" || handled.current === latest.id) return;
    const first = handled.current === null;
    handled.current = latest.id;
    if (first) return;
    void qc.invalidateQueries({ queryKey: docSyncQueries.repos().queryKey });
    void qc.invalidateQueries({ queryKey: docSyncQueries.schedule().queryKey });
  }, [latest, qc]);
  return query;
}

export function useStartDocSyncRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<DocSyncRun>("/doc-sync/run"),
    onSuccess: () => qc.invalidateQueries({ queryKey: docSyncQueries.runs().queryKey }),
  });
}

export const useDocSyncRepos = () => useQuery(docSyncQueries.repos());

export function useSetDocSyncRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: DocSyncRepoUpdate & { id: string }) =>
      api.patch<DocSyncRepo>(`/repos/${id}/doc-sync`, body),
    onSuccess: (saved) =>
      qc.setQueryData(docSyncQueries.repos().queryKey, (list) =>
        list?.map((r) => (r.id === saved.id ? saved : r)),
      ),
  });
}
