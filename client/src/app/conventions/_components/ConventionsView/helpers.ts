import type { ConventionCandidate } from "@devdigest/shared";
import { slugify } from "@/lib/slug";

/** Pure helpers for the Conventions Lab page — section grouping + the "merge
 *  selected candidates into one skill" draft builder for CreateSkillModal. */

export type LinkedSkill = NonNullable<ConventionCandidate["skill"]>;

export interface ConventionGroups {
  /** Accepted and not yet used in a skill — the only selectable ones. */
  ready: ConventionCandidate[];
  toReview: ConventionCandidate[];
  /** Accepted and linked, one entry per skill in first-seen order. */
  used: { skill: LinkedSkill; items: ConventionCandidate[] }[];
  rejected: ConventionCandidate[];
}

/** Split the list into the page sections (SPEC-2026-10-16-convention-skills
 *  AC-13). "Used" is derived from `skill`, not from a status value. */
export function groupConventions(list: ConventionCandidate[]): ConventionGroups {
  const groups: ConventionGroups = { ready: [], toReview: [], used: [], rejected: [] };
  const usedBySkill = new Map<string, { skill: LinkedSkill; items: ConventionCandidate[] }>();
  for (const c of list) {
    if (c.skill) {
      let group = usedBySkill.get(c.skill.id);
      if (!group) {
        group = { skill: c.skill, items: [] };
        usedBySkill.set(c.skill.id, group);
        groups.used.push(group);
      }
      group.items.push(c);
    } else if (c.status === "accepted") groups.ready.push(c);
    else if (c.status === "rejected") groups.rejected.push(c);
    else groups.toReview.push(c);
  }
  return groups;
}

/** Keep only selected ids that are still selectable — drops ids that were
 *  used, un-accepted or removed since they were ticked. Returns the same Set
 *  when nothing changed so React state stays referentially stable. */
export function pruneSelection(selected: Set<string>, ready: ConventionCandidate[]): Set<string> {
  const readyIds = new Set(ready.map((c) => c.id));
  const next = new Set([...selected].filter((id) => readyIds.has(id)));
  return next.size === selected.size ? selected : next;
}

function shortRepoName(repoFullName: string): string {
  return repoFullName.split("/").pop() ?? repoFullName;
}

export function buildSkillName(repoFullName: string): string {
  return `${slugify(shortRepoName(repoFullName))}-conventions`;
}

export function buildSkillDescription(repoFullName: string, count: number): string {
  const noun = count === 1 ? "convention" : "conventions";
  return `${count} house ${noun} extracted from ${shortRepoName(repoFullName)}`;
}

/** The skill body: one `##` section per selected candidate, each citing its
 *  evidence file + snippet — mirrors the "Create skill from conventions"
 *  modal preview. */
export function buildSkillBody(repoFullName: string, selected: ConventionCandidate[]): string {
  const name = buildSkillName(repoFullName);
  const header = `# ${name}\n\nHouse conventions for \`${shortRepoName(repoFullName)}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const sections = selected.map((c) => {
    const heading = slugify(c.rule).slice(0, 60) || "convention";
    const location = c.evidence_line != null ? `${c.evidence_path}:${c.evidence_line}` : c.evidence_path;
    const rationale = c.rationale ? `\n\n${c.rationale}` : "";
    return `## ${heading}\n${c.rule}${rationale}\n\nDetected in \`${location}\`:\n\`\`\`\n${c.evidence_snippet}\n\`\`\``;
  });
  return [header, ...sections].join("\n\n");
}
