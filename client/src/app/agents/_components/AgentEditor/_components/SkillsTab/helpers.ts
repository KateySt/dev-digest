import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** Full display order: linked skills first (in their `order`), then every
 *  other workspace skill appended after, in list order. */
export function initialOrder(skills: Skill[], links: AgentSkillLink[]): string[] {
  const linked = [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
  const linkedSet = new Set(linked);
  const rest = skills.map((s) => s.id).filter((id) => !linkedSet.has(id));
  return [...linked, ...rest];
}

/** Move `id` to just before/after `targetId` within `order`. */
export function reorder(order: string[], id: string, targetId: string): string[] {
  if (id === targetId) return order;
  const without = order.filter((x) => x !== id);
  const targetIndex = without.indexOf(targetId);
  if (targetIndex === -1) return order;
  return [...without.slice(0, targetIndex), id, ...without.slice(targetIndex)];
}

/** Skills matching a case-insensitive filter over name/description. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}
