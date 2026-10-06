// `initialOrder`/`reorder`/`filterDocuments` are shared with the Agent
// editor's Context tab — promoted to `@/lib/project-context` (same shape
// duplicated in both tabs otherwise). Re-exported here so this tab's own
// imports stay a single `./helpers` line.
export { initialOrder, reorder, filterDocuments } from "@/lib/project-context";

/**
 * "SERIALIZES AS" box content (C-AC-22) — the literal shape
 * `reviewer-core/src/prompt.ts`'s `wrapUntrusted('spec-N', …)` produces for
 * this skill's attached set, in current order. Each document's BODY is
 * shown as a `{{ path }}` placeholder rather than fetched/duplicated in
 * full — the structure and order are what this box proves (reordering here
 * updates it immediately); the run trace's Prompt assembly panel is where a
 * user reads the actual injected text for a specific run. Skill-tab-only —
 * the Agent editor's Context tab has no equivalent box.
 */
export function serializedBlock(paths: string[]): string {
  if (paths.length === 0) return "";
  const parts = paths.map((p, i) => `<untrusted source="spec-${i}">\n{{ ${p} }}\n</untrusted>`);
  return `## Project context\n${parts.join("\n\n")}`;
}
