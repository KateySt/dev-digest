import type { Memory, MemoryInput, MemoryLink } from "@devdigest/shared";

/**
 * Merge form defaults (SPEC-2026-10-12-memory-curation AC-C16): the primary's
 * text and kind; links and path globs unioned; confidence = max; repo scope if
 * any member is repo-scoped, so a repo rule never silently becomes global.
 * The user edits all of it before applying.
 */
export function mergeDefaults(members: Memory[], primaryId: string, repoId: string | null): MemoryInput {
  const primary = members.find((m) => m.id === primaryId) ?? members[0]!;
  const links = new Map<string, MemoryLink>();
  for (const m of members) {
    for (const { target_kind, target_id } of m.links) links.set(`${target_kind}:${target_id}`, { target_kind, target_id });
  }
  const repoScoped = repoId !== null && members.some((m) => m.scope === "repo");
  return {
    content: primary.content,
    kind: primary.kind,
    scope: repoScoped ? "repo" : "global",
    repo_id: repoScoped ? repoId : null,
    links: [...links.values()],
    applies_to_all_agents: members.some((m) => m.applies_to_all_agents),
    path_globs: [...new Set(members.flatMap((m) => m.path_globs))],
    confidence: Math.max(...members.map((m) => m.confidence)),
  };
}
