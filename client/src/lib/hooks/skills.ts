/* hooks/skills.ts — React Query hooks for the Skills Lab page + the Add Skill
   drawer's URL/Community tabs. File import needs no dedicated hook — the
   caller reads the File client-side and calls useCreateSkill(). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CommunitySkill, Skill, SkillType } from "@devdigest/shared";

/** GET /skills' list item — the `Skill` DTO plus a lightweight usage summary
 *  ("N agents · X% pull · Y% accept") for the card, batched server-side
 *  across every agent using each skill (see the server's
 *  `computeSkillUsageSummaries` doc comment for the approximation). */
export interface SkillListItem extends Skill {
  usage: {
    used_by_agents: number;
    pull_frequency: number | null;
    accept_rate: number | null;
  };
}

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<SkillListItem[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name?: string;
  description?: string;
  type: SkillType;
  body: string;
  source?: "manual" | "imported_url" | "extracted" | "community";
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

/** Server-side fetch of a skill body from a URL — stored disabled until vetted. */
export function useImportSkillUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.post<Skill>("/skills/import-url", { url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

/** Fixture community catalog search (no live external index in this repo). */
export function useCommunitySkills(query: string, lang?: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (lang) params.set("lang", lang);
  const qs = params.toString();
  return useQuery({
    queryKey: ["community-skills", query, lang],
    queryFn: () => api.get<CommunitySkill[]>(`/skills/community${qs ? `?${qs}` : ""}`),
  });
}

export function useImportCommunitySkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Skill>("/skills/import-community", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

/** The Versions tab's history list — GET /skills/:id/versions. Ad-hoc (not a
 *  shared contract, display-only, mirrors the server's `SkillVersionListItem`). */
export interface SkillVersionListItem {
  version: number;
  created_at: string;
  body: string;
  current: boolean;
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersionListItem[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

/** The Stats tab's aggregate — GET /skills/:id/stats. Ad-hoc (not a shared
 *  contract, display-only, mirrors the server's `SkillStats`). An
 *  APPROXIMATION: findings aren't attributed to a specific skill, only to
 *  the agent that produced them, so this rolls up every agent currently
 *  linked to the skill (see the server's `computeSkillStats` doc comment). */
export interface SkillStats {
  used_by_agents: number;
  agents: { id: string; name: string }[];
  pull_frequency: number | null;
  accept_rate: number | null;
  findings_30d: number;
  findings_by_category: { category: string; count: number }[];
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}
