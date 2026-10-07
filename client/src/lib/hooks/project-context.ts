/* hooks/project-context.ts — TanStack Query hooks for SPEC-04 (Project
   Context): the repo-scoped document list/refresh/read/save, and the
   agent/skill whole-ordered-attached-set endpoints. Retargets the dormant
   `useContextFiles`/`useReindexContext` that used to live in `core.ts` (see
   `client/INSIGHTS.md`/the SPEC-04 Development Plan) onto the routes Batch C
   actually built — those two hooks are removed from `core.ts` in this same
   change so there's exactly one hook set per route. */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient, type MutateOptions } from "@tanstack/react-query";
import { api } from "../api";
import type { ProjectContextAttachment, ProjectContextList, SpecFile } from "../types";

/** Which agent/skill (if any) a request is scoped to — selects which
 *  model's tokenizer counts tokens server-side (server AC-5). Both omitted
 *  ⇒ always an estimate (the bare Project Context page). */
export interface ProjectContextScope {
  agentId?: string | null;
  skillId?: string | null;
}

function scopeParams(scope?: ProjectContextScope): string {
  const params = new URLSearchParams();
  if (scope?.agentId) params.set("agent_id", scope.agentId);
  if (scope?.skillId) params.set("skill_id", scope.skillId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function listKey(repoId: string | null | undefined, scope?: ProjectContextScope) {
  return ["project-context", repoId, scope?.agentId ?? null, scope?.skillId ?? null];
}

/** The repo's discovered/attachable document list (server AC-1..4, AC-21,
 *  AC-22, AC-28's locally-modified marker). */
export function useProjectContextDocuments(
  repoId: string | null | undefined,
  scope?: ProjectContextScope,
) {
  return useQuery({
    queryKey: listKey(repoId, scope),
    queryFn: () => api.get<ProjectContextList>(`/repos/${repoId}/context${scopeParams(scope)}`),
    enabled: !!repoId,
  });
}

/** Explicit refresh action (server AC-3, AC-7) — re-scans now; same response
 *  shape as the list query, so the result seeds the cache directly. */
export function useRefreshProjectContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, scope }: { repoId: string; scope?: ProjectContextScope }) =>
      api.post<ProjectContextList>(`/repos/${repoId}/context/refresh${scopeParams(scope)}`),
    onSuccess: (data, { repoId, scope }) => qc.setQueryData(listKey(repoId, scope), data),
  });
}

/** One document's content + token count (server AC-23-ish read path). */
export function useProjectContextDocument(
  repoId: string | null | undefined,
  path: string | null | undefined,
  scope?: ProjectContextScope,
) {
  return useQuery({
    queryKey: ["project-context-document", repoId, path, scope?.agentId ?? null, scope?.skillId ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("path", path!);
      if (scope?.agentId) params.set("agent_id", scope.agentId);
      if (scope?.skillId) params.set("skill_id", scope.skillId);
      return api.get<SpecFile>(`/repos/${repoId}/context/document?${params.toString()}`);
    },
    enabled: !!repoId && !!path,
  });
}

/** Create/save a document (server AC-23..27) — writes into the clone
 *  working tree only, no commit. Invalidates the list so the new/changed
 *  document, its size, and its token count show up without a manual
 *  refresh. */
export function useSaveProjectContextDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, path, content }: { repoId: string; path: string; content: string }) =>
      api.post<SpecFile>(`/repos/${repoId}/context/document`, { path, content }),
    onSuccess: (_data, { repoId }) => {
      qc.invalidateQueries({ queryKey: ["project-context", repoId] });
      qc.invalidateQueries({ queryKey: ["project-context-document", repoId] });
    },
  });
}

// ---- Agent / skill Context tab — whole-ordered-set (server AC-9, AC-10) ----

/** Query keys for an owner's attached set (read by the Context tabs to derive
 *  the next set from the latest cache, C-AC-32). */
export const agentContextKey = (agentId: string | null | undefined) => ["agent-context", agentId] as const;
export const skillContextKey = (skillId: string | null | undefined) => ["skill-context", skillId] as const;

/** Whole ordered set → the cache shape (order = position). */
const toAttachments = (paths: string[]): ProjectContextAttachment[] => paths.map((path, order) => ({ path, order }));

/**
 * Optimistic, per-owner-serialized set-replace (C-AC-31..33). Every request
 * carries the FULL set, so requests must run one at a time in click order:
 * `scope` queues them (TanStack v5). The optimistic cache write happens
 * synchronously in `replace` (NOT in `onMutate`, which v5 runs a microtask
 * later) so a second action in the same tick already builds on the first. A
 * failure rolls the cache back to the snapshot taken before that change; the
 * settle step re-syncs from the server only once the last queued request is
 * done, so an early refetch can't overwrite a still-pending optimistic set.
 */
function useSetContextDocuments(
  ownerKind: "agent" | "skill",
  ownerId: string,
  keyOf: (id: string) => readonly unknown[],
) {
  const qc = useQueryClient();
  const key = keyOf(ownerId);
  const mutationKey = [`${ownerKind}-context-set`, ownerId];
  const mutation = useMutation({
    mutationKey,
    scope: { id: `${ownerKind}-context:${ownerId}` },
    mutationFn: ({ paths }: { paths: string[]; previous: ProjectContextAttachment[] | undefined }) =>
      api.post<ProjectContextAttachment[]>(`/${ownerKind}s/${ownerId}/context`, { paths }),
    onMutate: () => qc.cancelQueries({ queryKey: key }),
    onError: (_err, { previous }) => {
      qc.setQueryData(key, previous);
    },
    onSettled: () => {
      // This mutation still counts as pending inside onSettled.
      if (qc.isMutating({ mutationKey }) <= 1) qc.invalidateQueries({ queryKey: key });
    },
  });
  const { mutate } = mutation;
  /** Apply `paths` to the cache now, then queue the POST. */
  const replace = React.useCallback(
    (paths: string[], options?: MutateOptions<ProjectContextAttachment[], Error, { paths: string[]; previous: ProjectContextAttachment[] | undefined }>) => {
      const previous = qc.getQueryData<ProjectContextAttachment[]>(key);
      qc.setQueryData(key, toAttachments(paths));
      mutate({ paths, previous }, options);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, mutate, ownerId],
  );
  return { replace, isPending: mutation.isPending };
}

export function useAgentContextDocuments(agentId: string | null | undefined) {
  return useQuery({
    queryKey: agentContextKey(agentId),
    queryFn: () => api.get<ProjectContextAttachment[]>(`/agents/${agentId}/context`),
    enabled: !!agentId,
  });
}

/** `replace(paths)` replaces the agent's whole attached set. */
export function useSetAgentContextDocuments(agentId: string) {
  return useSetContextDocuments("agent", agentId, agentContextKey);
}

export function useSkillContextDocuments(skillId: string | null | undefined) {
  return useQuery({
    queryKey: skillContextKey(skillId),
    queryFn: () => api.get<ProjectContextAttachment[]>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

/** `replace(paths)` replaces the skill's whole attached set. */
export function useSetSkillContextDocuments(skillId: string) {
  return useSetContextDocuments("skill", skillId, skillContextKey);
}
