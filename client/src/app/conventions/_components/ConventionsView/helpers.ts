import type { ConventionCandidate } from "@devdigest/shared";

/** Pure helpers for the Conventions Lab page — filtering + the "merge
 *  accepted candidates into one skill" draft builder for CreateSkillModal. */

export function acceptedCandidates(list: ConventionCandidate[]): ConventionCandidate[] {
  return list.filter((c) => c.status === "accepted");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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

/** The skill body: one `##` section per accepted candidate, each citing its
 *  evidence file + snippet — mirrors the "Create skill from conventions"
 *  modal preview. */
export function buildSkillBody(repoFullName: string, accepted: ConventionCandidate[]): string {
  const name = buildSkillName(repoFullName);
  const header = `# ${name}\n\nHouse conventions for \`${shortRepoName(repoFullName)}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const sections = accepted.map((c) => {
    const heading = slugify(c.rule).slice(0, 60) || "convention";
    const location = c.evidence_line != null ? `${c.evidence_path}:${c.evidence_line}` : c.evidence_path;
    const rationale = c.rationale ? `\n\n${c.rationale}` : "";
    return `## ${heading}\n${c.rule}${rationale}\n\nDetected in \`${location}\`:\n\`\`\`\n${c.evidence_snippet}\n\`\`\``;
  });
  return [header, ...sections].join("\n\n");
}
