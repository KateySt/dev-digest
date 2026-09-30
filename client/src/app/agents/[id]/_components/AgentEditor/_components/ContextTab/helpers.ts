import type { SpecFile } from "@/lib/types";

// `initialOrder`/`reorder`/`filterDocuments` are shared with the Skill
// editor's Context tab — promoted to `@/lib/project-context` (same shape
// duplicated in both tabs otherwise). Re-exported here so this tab's own
// imports stay a single `./helpers` line.
export { initialOrder, reorder, filterDocuments } from "@/lib/project-context";

/** Sum of the attached subset's token counts, marked `estimated` when ANY
 *  contributing document's count is (C-AC-16). Agent-tab-only — the Skill
 *  editor's Context tab has no equivalent footer total. */
export function tokenTotal(documents: SpecFile[]): { tokens: number; estimated: boolean } {
  let tokens = 0;
  let estimated = false;
  for (const d of documents) {
    tokens += d.tokens ?? 0;
    if (d.tokens_estimated) estimated = true;
  }
  return { tokens, estimated };
}
