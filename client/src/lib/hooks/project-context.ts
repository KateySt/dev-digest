/* hooks/project-context.ts — TanStack Query hooks for SPEC-04 (Project
   Context): the repo-scoped document list/refresh/read/save, and the
   agent/skill whole-ordered-attached-set endpoints. Retargets the dormant
   `useContextFiles`/`useReindexContext` that used to live in `core.ts` (see
   `client/INSIGHTS.md`/the SPEC-04 Development Plan) onto the routes Batch C
   actually built — those two hooks are removed from `core.ts` in this same
   change so there's exactly one hook set per route. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

// ---- Agent Context tab — whole-ordered-set (server AC-9) -----------------

export function useAgentContextDocuments(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", agentId],
    queryFn: () => api.get<ProjectContextAttachment[]>(`/agents/${agentId}/context`),
    enabled: !!agentId,
  });
}

export function useSetAgentContextDocuments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, paths }: { agentId: string; paths: string[] }) =>
      api.post<ProjectContextAttachment[]>(`/agents/${agentId}/context`, { paths }),
    onSuccess: (_data, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-context", agentId] });
    },
  });
}

// ---- Skill Context tab — whole-ordered-set (server AC-10) -----------------

export function useSkillContextDocuments(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId],
    queryFn: () => api.get<ProjectContextAttachment[]>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

export function useSetSkillContextDocuments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, paths }: { skillId: string; paths: string[] }) =>
      api.post<ProjectContextAttachment[]>(`/skills/${skillId}/context`, { paths }),
    onSuccess: (_data, { skillId }) => {
      qc.invalidateQueries({ queryKey: ["skill-context", skillId] });
    },
  });
}
