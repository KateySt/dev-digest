/* hooks/skills.ts — React Query hooks for the Skills Lab page + the Add Skill
   drawer's URL/Community tabs. File import needs no dedicated hook — the
   caller reads the File client-side and calls useCreateSkill(). SPEC-07
   (community skill catalog) reshaped the community/import hooks and added
   suggestions + catalog-test. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CatalogTestResult, CommunityCatalogListing, Skill, SkillType } from "@devdigest/shared";

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

/** `GET /skills`, optionally narrowed to one project's working set (2026-10-02
 *  amendment). `repoFilter` omitted ⇒ every skill in the workspace (what the
 *  Agent editor's skill picker always gets — it calls this with no args);
 *  `"none"` ⇒ global-only; a repo id ⇒ that project's skills plus global.
 *  `enabled: false` lets a caller hold off fetching until it knows which
 *  filter to use (e.g. while the active repo is still resolving) instead of
 *  fetching the wrong default and re-fetching a moment later. */
export function useSkills(repoFilter?: string, opts: { enabled?: boolean } = {}) {
  const qs = repoFilter ? `?repo_id=${encodeURIComponent(repoFilter)}` : "";
  return useQuery({
    queryKey: ["skills", repoFilter ?? "all"],
    queryFn: () => api.get<SkillListItem[]>(`/skills${qs}`),
    enabled: opts.enabled ?? true,
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
  // "repo_id" included for project-scope reassignment (2026-10-02 amendment):
  // omitted ⇒ not touched, null ⇒ cleared to global, a repo id ⇒ reassigned.
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled" | "repo_id">> & {
    override?: boolean;
  };
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

/** Re-run the content-malware scan against the skill's current body (Skill
 *  Editor's "Re-scan" action) — see server `POST /skills/:id/scan`. */
export function useScanSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Skill>(`/skills/${id}/scan`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
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

// ---- Community catalog (SPEC-07) -----------------------------------------

/** Live catalog listing — `GET /skills/community`. One query key per
 *  (query, tag) pair; folders and tags both derive from this single payload
 *  client-side (no second unfiltered fetch, client spec "No duplicate fetch
 *  to derive filters"). `data.available === false` is the unavailable
 *  outcome (S-AC-31) — distinct from a reachable-but-empty `entries: []`. */
export function useCommunitySkills(query?: string, tag?: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (tag) params.set("tag", tag);
  const qs = params.toString();
  return useQuery({
    queryKey: ["community-skills", query ?? "", tag ?? ""],
    queryFn: () => api.get<CommunityCatalogListing>(`/skills/community${qs ? `?${qs}` : ""}`),
  });
}

/** Explicit catalog refresh (client spec's retry action on the unavailable
 *  state, and any future "refresh" affordance) — discards the server's
 *  cached listing and re-fetches (S-AC-7). */
export function useRefreshCommunityCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CommunityCatalogListing>("/skills/community/refresh"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-skills"] }),
  });
}

export interface ImportCommunitySkillInput {
  path: string;
  repo_id: string;
}

export function useImportCommunitySkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, repo_id }: ImportCommunitySkillInput) =>
      api.post<Skill>("/skills/import-community", { path, repo_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      // An import excludes that path from future suggestion responses
      // (S-AC-28) — drop every project's cached suggestion list so the
      // onboarding card and the Community tab's pinned group both reflect
      // it without a manual refresh (client spec AC-40).
      qc.invalidateQueries({ queryKey: ["skill-suggestions"] });
    },
  });
}

/** Per-project catalog suggestions — `GET /repos/:id/skill-suggestions`
 *  (S-AC-26 – S-AC-32). Already language-matched, threshold-filtered, and
 *  de-duplicated against imports server-side — this hook performs no
 *  matching of its own. */
export function useSkillSuggestions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-suggestions", repoId],
    queryFn: () => api.get<CommunityCatalogListing>(`/repos/${repoId}/skill-suggestions`),
    enabled: !!repoId,
  });
}

/** Settings → Catalog "Test" action — `POST /settings/catalog-test`. An
 *  optional `repo` tests an unsaved edit without persisting it (client spec
 *  AC-34); omitted, it tests the resolved stored/env value. */
export function useCatalogTest() {
  return useMutation({
    mutationFn: (repo?: string) => api.post<CatalogTestResult>("/settings/catalog-test", { repo }),
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
      // A restore creates a new current version — the skill's eval history and
      // dashboards (version chips, Promote visibility) must follow.
      qc.invalidateQueries({ queryKey: ["skill-eval-runs", data.id] });
      qc.invalidateQueries({ queryKey: ["skill-eval-compare", data.id] });
      qc.invalidateQueries({ queryKey: ["eval-stats", "skill", data.id] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard-skills"] });
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
