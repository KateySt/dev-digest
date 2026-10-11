import type { AgentColumn, AgentColumnStatus, FindingGroup, GroupMember } from "@devdigest/shared";
import { DEFAULT_VIEW, type ResultsView } from "./constants";

import { formatCost, formatDuration } from "@/app/multi-agent/helpers";

export const isInFlight = (status: AgentColumnStatus): boolean => status === "queued" || status === "running";

export const parseView = (raw: string | null | undefined): ResultsView =>
  raw === "tabs" || raw === "columns" ? raw : DEFAULT_VIEW;

/** finding id -> the group it belongs to (every member id is indexed). */
export function groupsByFindingId(groups: readonly FindingGroup[] | null | undefined): Map<string, FindingGroup> {
  const map = new Map<string, FindingGroup>();
  for (const g of groups ?? []) for (const m of g.members) map.set(m.finding_id, g);
  return map;
}

/** The group's other members (the card's own finding excluded); [] when ungrouped. */
export function otherMembers(group: FindingGroup | undefined, findingId: string): GroupMember[] {
  return group ? group.members.filter((m) => m.finding_id !== findingId) : [];
}

/** The column's own `started_at`, falling back to the multi-run's creation time. */
export function startedAtMs(column: AgentColumn, fallbackIso: string): number | null {
  const ms = Date.parse(column.started_at ?? fallbackIso);
  return Number.isNaN(ms) ? null : ms;
}

export const elapsedSeconds = (startMs: number | null, nowMs: number): number =>
  startMs == null ? 0 : Math.max(0, Math.floor((nowMs - startMs) / 1000));

/** The column whose tab is selected; falls back to the first column. */
export function selectedColumn(columns: readonly AgentColumn[], agentId: string | null): AgentColumn | undefined {
  return columns.find((c) => c.agent_id === agentId) ?? columns[0];
}

/** "8.2s · $0.06"; unknown values render "—" (never 0). */
export function metaLine(durationMs: number | null, costUsd: number | null): string {
  return `${formatDuration(durationMs)} · ${formatCost(costUsd)}`;
}
