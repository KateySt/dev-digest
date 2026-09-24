import type { Risk } from "@devdigest/shared";
import type { RiskAnnotation } from "./RiskAnnotationCard";

/** "path:12-18" or "path:34" → { path, line } — `line` is the range's first
 *  number (the diff-viewer jump target scrolls to it / anchors the card there). */
export function parseFileRef(ref: string): { path: string; line: number } | null {
  const m = ref.match(/^(.+):(\d+)(?:-\d+)?$/);
  if (!m) return null;
  return { path: m[1]!, line: Number(m[2]) };
}

/** path → (line → annotation), one entry per risk file_ref. Built once from
 *  ALL of a PR's risks so every risk shows inline as soon as its file is
 *  visible — not just the one whose Overview card you happened to click. */
export type RiskAnnotationsByFile = Map<string, Map<number, RiskAnnotation>>;

export function buildRiskAnnotations(risks: Risk[]): RiskAnnotationsByFile {
  const byFile: RiskAnnotationsByFile = new Map();
  for (const risk of risks) {
    for (const ref of risk.file_refs) {
      const parsed = parseFileRef(ref);
      if (!parsed) continue;
      const byLine = byFile.get(parsed.path) ?? new Map<number, RiskAnnotation>();
      // First risk to claim a line wins — good enough until a line legitimately
      // needs to surface more than one risk at once.
      if (!byLine.has(parsed.line)) {
        byLine.set(parsed.line, {
          kind: risk.kind,
          title: risk.title,
          explanation: risk.explanation,
          severity: risk.severity,
        });
      }
      byFile.set(parsed.path, byLine);
    }
  }
  return byFile;
}
