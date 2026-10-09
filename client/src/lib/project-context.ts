import type { ProjectContextAttachment } from "@devdigest/shared";
import type { SpecFile } from "./types";

/**
 * Shared pure helpers for the Agent editor's and Skill editor's Context tabs
 * (`AgentEditor/_components/ContextTab`, `SkillEditor/_components/ContextTab`)
 * — promoted here (same precedent as `findings.ts`) so the two tabs don't
 * carry byte-for-byte duplicate copies of the same ordering/filtering logic.
 */

/** Full display order: attached documents first (in their stored `order`),
 *  then every other discovered document appended after, in list order. */
export function initialOrder(paths: string[], attached: ProjectContextAttachment[]): string[] {
  const linked = [...attached].sort((a, b) => a.order - b.order).map((a) => a.path);
  const linkedSet = new Set(linked);
  const rest = paths.filter((p) => !linkedSet.has(p));
  return [...linked, ...rest];
}

/** Move `id` to just before `targetId` within `order`. */
export function reorder(order: string[], id: string, targetId: string): string[] {
  if (id === targetId) return order;
  const without = order.filter((x) => x !== id);
  const targetIndex = without.indexOf(targetId);
  if (targetIndex === -1) return order;
  return [...without.slice(0, targetIndex), id, ...without.slice(targetIndex)];
}

/** Documents matching a case-insensitive filename filter (C-AC-17). */
export function filterDocuments(documents: SpecFile[], query: string): SpecFile[] {
  const q = query.trim().toLowerCase();
  if (!q) return documents;
  return documents.filter((d) => d.path.toLowerCase().includes(q));
}
