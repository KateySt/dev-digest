import type { Skill } from "@devdigest/shared";

/** Skills matching a case-insensitive search over name/description. Generic
 *  over `T extends Skill` so callers passing the richer `SkillListItem`
 *  (list + usage summary) don't lose that field through the filter. */
export function filterSkills<T extends Skill>(skills: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}
