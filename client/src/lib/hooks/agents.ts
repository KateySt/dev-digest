/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useSkills } from "./skills";
import type { Agent, AgentSkillLink, ModelInfo, Provider, ReviewStrategy } from "@devdigest/shared";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  enabled?: boolean;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "enabled"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", data.id], data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.removeQueries({ queryKey: ["agent", id] });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

/** An agent's linked skills, ordered — the Agent editor's Skills tab. */
export function useAgentSkillLinks(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** The agent's linked skills as `{id, name}` in link order, for pickers (e.g.
 *  FindingCard's "Turn into eval case" targets). `null` while either the links or
 *  the skill list is still loading — callers must NOT read that as "no skills".
 *  A failed fetch degrades to `[]` so a picker never blocks on it. */
export function useLinkedSkills(agentId: string | null | undefined): { id: string; name: string }[] | null {
  const links = useAgentSkillLinks(agentId);
  const skills = useSkills(undefined, { enabled: !!agentId });
  if (!agentId) return [];
  if (links.isError || skills.isError) return [];
  if (!links.data || !skills.data) return null;
  const nameById = new Map(skills.data.map((sk) => [sk.id, sk.name]));
  return [...links.data]
    .sort((a, b) => a.order - b.order)
    .flatMap((l) => (nameById.has(l.skill_id) ? [{ id: l.skill_id, name: nameById.get(l.skill_id)! }] : []));
}

/** Replace the agent's whole linked-skill set, in order (attach/detach/reorder). */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (_data, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
    },
  });
}

/** "Promote vN" — POST /agents/:id/versions/:version/promote. Applies that
 *  snapshot as a NEW current version; a 409 (deleted skills) surfaces as an
 *  ApiError whose `details.missing_skills` lists them. */
export function usePromoteAgentVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, version }: { agentId: string; version: number }) =>
      api.post<Agent>(`/agents/${agentId}/versions/${version}/promote`),
    onSuccess: (agent) => {
      qc.setQueryData(["agent", agent.id], agent);
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent-skills", agent.id] });
      qc.invalidateQueries({ queryKey: ["agent-eval-runs", agent.id] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}
