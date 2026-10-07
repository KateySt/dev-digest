import type { SkillScanFinding, SkillScanStatus } from "@devdigest/shared";
import type { SkillRunBlock } from "@/lib/hooks/eval-runs";

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

type Translate = (key: string) => string;

/** i18n text (under the `skills` namespace) for why a skill's eval run can't
 *  start; undefined when it can. `t` is `useTranslations("skills")`. */
export function runBlockText(t: Translate, block: SkillRunBlock | null): string | undefined {
  if (!block) return undefined;
  if (block.kind === "running") return t("evals.reason.running");
  if (block.kind === "noCases") return t("evals.reason.noCases");
  if (block.status === "pending") return t("evals.reason.scanPending");
  if (block.status === "error") return t("evals.reason.scanError");
  return t("evals.reason.scanFlagged");
}
