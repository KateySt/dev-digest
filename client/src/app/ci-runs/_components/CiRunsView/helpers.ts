import type { CiRun, Severity } from "@devdigest/shared";

/** Per-severity counts for `SeverityCountBadges`; `null` when the run has none. */
export function severityCounts(run: CiRun): Record<Severity, number> | null {
  const counts = { CRITICAL: run.critical ?? 0, WARNING: run.warning ?? 0, SUGGESTION: run.suggestion ?? 0 };
  return counts.CRITICAL + counts.WARNING + counts.SUGGESTION > 0 ? counts : null;
}

/** "7.4s" / "2m 05s"; "-" when unknown. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const rest = Math.round(seconds - m * 60);
  return `${m}m ${String(rest).padStart(2, "0")}s`;
}
