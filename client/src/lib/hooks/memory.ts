"use client";

/* Memory & Learn hooks (SPEC-2026-10-12-memory). Memory is written only by a
   human-confirmed Save / Merge in the Learn modal or the Memory page. */
import React from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateMemoryBody,
  LearnDraftResponse,
  Memory,
  MemoryListQuery,
  MemoryListResponse,
  MemorySummary,
  MergeMemoryBody,
  UpdateMemoryBody,
} from "@devdigest/shared";
import { api } from "@/lib/api";

/** Debounce for the Learn modal's duplicate check (AC-9). */
export const SIMILAR_DEBOUNCE_MS = 400;
/** Below this the duplicate check is noise — no request. */
export const SIMILAR_MIN_CHARS = 20;

function listPath(query: MemoryListQuery): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `/memories?${s}` : "/memories";
}

export const memoryQueries = {
  all: () => ["memories"] as const,
  list: (query: MemoryListQuery) =>
    queryOptions({
      queryKey: ["memories", query],
      queryFn: () => api.get<MemoryListResponse>(listPath(query)),
    }),
  detail: (id: string) =>
    queryOptions({ queryKey: ["memory", id], queryFn: () => api.get<Memory>(`/memories/${id}`) }),
  similar: (content: string, repoId: string | null) =>
    queryOptions({
      queryKey: ["memories-similar", repoId, content],
      queryFn: () => {
        const qs = new URLSearchParams({ content });
        if (repoId) qs.set("repo_id", repoId);
        return api.get<MemorySummary[]>(`/memories/similar?${qs.toString()}`);
      },
    }),
};

export function useMemories(query: MemoryListQuery) {
  return useQuery(memoryQueries.list(query));
}

export function useMemory(id: string | null) {
  return useQuery({ ...memoryQueries.detail(id ?? ""), enabled: !!id });
}

/** Debounced copy of `value`, starting from `initial` (so mount is debounced too). */
function useDebouncedValue<T>(value: T, ms: number, initial: T): T {
  const [debounced, setDebounced] = React.useState(initial);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Up to 3 near-duplicates of `content` (debounced, also on mount — the Learn
 *  draft response already carries the initial `similar` list). */
export function useSimilarMemories(content: string, repoId: string | null) {
  const debounced = useDebouncedValue(content.trim(), SIMILAR_DEBOUNCE_MS, "");
  return useQuery({
    ...memoryQueries.similar(debounced, repoId),
    enabled: debounced.length >= SIMILAR_MIN_CHARS,
  });
}

/** POST /findings/:id/learn/draft — user-triggered, never cached. */
export function useLearnDraft() {
  return useMutation({
    mutationFn: (findingId: string) => api.post<LearnDraftResponse>(`/findings/${findingId}/learn/draft`),
  });
}

/** Lists + the finding cards that render the "Learned" state. */
function invalidateAfterLearn(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: memoryQueries.all() }),
    qc.invalidateQueries({ queryKey: ["memories-similar"] }),
    qc.invalidateQueries({ queryKey: ["reviews"] }),
    qc.invalidateQueries({ queryKey: ["multi-agent-run"] }),
  ]);
}

export function useCreateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMemoryBody) => api.post<Memory>("/memories", body),
    onSuccess: (saved) => {
      qc.setQueryData(memoryQueries.detail(saved.id).queryKey, saved);
      return invalidateAfterLearn(qc);
    },
  });
}

export function useMergeMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MergeMemoryBody }) =>
      api.post<Memory>(`/memories/${id}/merge`, body),
    onSuccess: (saved) => {
      qc.setQueryData(memoryQueries.detail(saved.id).queryKey, saved);
      return invalidateAfterLearn(qc);
    },
  });
}

export function useUpdateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMemoryBody }) =>
      api.patch<Memory>(`/memories/${id}`, patch),
    onSuccess: (saved) => {
      qc.setQueryData(memoryQueries.detail(saved.id).queryKey, saved);
      return Promise.all([
        qc.invalidateQueries({ queryKey: memoryQueries.all() }),
        qc.invalidateQueries({ queryKey: ["memories-similar"] }),
      ]);
    },
  });
}

export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/memories/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: memoryQueries.detail(id).queryKey });
      return invalidateAfterLearn(qc);
    },
  });
}
