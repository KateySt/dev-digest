import type { Memory, MemoryInput } from "@devdigest/shared";
import { CONFIDENCE_HIGH, CONFIDENCE_MID } from "./constants";

const DAY_MS = 86_400_000;

export type UsedLabel =
  | { key: "neverUsed" }
  | { key: "usedToday" }
  | { key: "usedDayAgo" }
  | { key: "usedDaysAgo"; days: number };

/** "never used" / "used today" / "used 1d ago" / "used Nd ago" (memory.json card.*). */
export function usedLabel(lastUsedAt: string | null, now: Date): UsedLabel {
  if (!lastUsedAt) return { key: "neverUsed" };
  const days = Math.floor((now.getTime() - new Date(lastUsedAt).getTime()) / DAY_MS);
  if (days <= 0) return { key: "usedToday" };
  if (days === 1) return { key: "usedDayAgo" };
  return { key: "usedDaysAgo", days };
}

export function confidenceTone(c: number): "high" | "mid" | "low" {
  if (c >= CONFIDENCE_HIGH) return "high";
  if (c >= CONFIDENCE_MID) return "mid";
  return "low";
}

/** Scope/kind are multi-select checkboxes (design), applied client-side; the
 *  server returns facet counts for them. */
export function filterMemories(items: Memory[], scopes: ReadonlySet<string>, kinds: ReadonlySet<string>): Memory[] {
  return items.filter((m) => scopes.has(m.scope) && kinds.has(m.kind));
}

/** A stored memory as the editable form value (detail Edit, curation Edit). */
export function memoryToInput(m: Memory): MemoryInput {
  return {
    content: m.content,
    kind: m.kind,
    scope: m.scope === "global" ? "global" : "repo",
    repo_id: m.repo_id,
    path_globs: m.path_globs,
    links: m.links.map(({ target_kind, target_id }) => ({ target_kind, target_id })),
    applies_to_all_agents: m.applies_to_all_agents,
    confidence: m.confidence,
  };
}
