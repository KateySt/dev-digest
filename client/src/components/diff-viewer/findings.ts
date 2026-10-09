/* Inline-finding support for the DiffViewer (Files changed tab). Mirrors
   comments.ts's shape/partition pattern, but anchors a finding on its
   `start_line` (RIGHT side only — a finding is always about the new code,
   never the deleted side of a hunk). Findings themselves come from the
   existing `usePrReviews` query (see hooks/reviews.ts#useSmartDiff doc
   comment) — this file only groups/anchors whatever list it's handed. */
import type { ReactNode } from "react";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { lineKey } from "./comments";

/** What the viewer needs to read + act on inline findings. `renderFinding` is
 *  a render-prop so `components/diff-viewer/` (shared/reusable) never has to
 *  import the feature-local `FindingCard` from `app/**​/_components/` —
 *  DiffTab supplies the element, diff-viewer just places it. */
export interface DiffFindingApi {
  findings: FindingRecord[];
  /** When false, matched + unanchored finding blocks are hidden (mirrors
   *  DiffCommentApi.showComments; both are driven off one shared toggle in
   *  DiffTab). */
  showFindings: boolean;
  onAction: (findingId: string, action: FindingActionKind) => void;
  pending?: boolean;
  renderFinding: (finding: FindingRecord) => ReactNode;
}

/** All findings that belong to one file. */
export function findingsForPath(findings: FindingRecord[], path: string): FindingRecord[] {
  return findings.filter((f) => f.file === path);
}

/** The key a finding anchors on — RIGHT side, `start_line` (same `${side}:${line}`
 *  format as comments.ts#lineKey, so it can be matched against the same
 *  `renderedKeys` a FileCard already builds from `keysForLine`). */
export function keyForFinding(f: FindingRecord): string | null {
  return lineKey("RIGHT", f.start_line);
}

/**
 * Split findings into those whose anchor line is actually rendered in this
 * patch vs. "unanchored" ones (the finding's line isn't in the visible diff —
 * e.g. an unrelated hunk wasn't included, or the file was reviewed before a
 * later push changed line numbers). Mirrors `partitionThreads` — nothing is
 * silently dropped, the unanchored bucket is rendered separately.
 */
export function partitionFindings(
  findings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const unanchored: FindingRecord[] = [];
  for (const f of findings) {
    const key = keyForFinding(f);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      unanchored.push(f);
    }
  }
  return { matched, unanchored };
}
