import type { SkillScanFinding, SkillScanStatus } from "@devdigest/shared";

/** Mirrors the server's `modules/skills/helpers.ts` gate (kept here instead
 *  of a shared package since it's tiny, display-only logic — same reasoning
 *  as the other ad-hoc list/stats shapes in `lib/hooks/skills.ts`). A skill
 *  never scanned (`pending`) or whose scan errored (`error`) is treated as
 *  blocking, same as an unacknowledged critical/high finding — fail closed. */
export function hasBlockingFindings(findings: SkillScanFinding[] | null | undefined): boolean {
  return (findings ?? []).some((f) => f.severity === "critical" || f.severity === "high");
}

export function isScanBlocking(
  status: SkillScanStatus,
  findings?: SkillScanFinding[] | null,
): boolean {
  if (status === "error" || status === "pending") return true;
  if (status === "flagged") return hasBlockingFindings(findings);
  return false;
}
