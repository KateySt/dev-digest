/** Badge colors for a CI run status (shared by the CI tab and the CI Runs page). */
export function ciStatusTone(status: string | null | undefined): { color: string; bg: string } {
  switch (status) {
    case "succeeded":
      return { color: "var(--ok)", bg: "var(--ok-bg)" };
    case "failed":
      return { color: "var(--crit)", bg: "var(--crit-bg)" };
    case "running":
      return { color: "var(--accent-text)", bg: "var(--accent-bg)" };
    default:
      return { color: "var(--text-secondary)", bg: "var(--bg-hover)" };
  }
}

/** Statuses that have an i18n label under `ci.runs.status.*`. */
export const KNOWN_CI_STATUSES = ["succeeded", "no_findings", "failed", "running"] as const;
export function isKnownCiStatus(status: string | null | undefined): status is (typeof KNOWN_CI_STATUSES)[number] {
  return KNOWN_CI_STATUSES.some((s) => s === status);
}

const KNOWN_INGEST_ERRORS = [
  "artifact_missing",
  "artifact_expired",
  "artifact_too_large",
  "artifact_invalid",
  "secret_detected",
] as const;

/** Maps a run's `ingest_error` (`verification_failed:<check>` carries the failed
 *  check) to an `ci.runs.ingestError.*` i18n key + values; `null` = show it raw. */
export function ingestErrorMessage(
  ingestError: string,
): { key: string; values: Record<string, string> } | null {
  const [code, detail] = ingestError.split(":");
  if (code === "verification_failed") {
    return { key: "runs.ingestError.verification_failed", values: { check: detail ?? "" } };
  }
  if (KNOWN_INGEST_ERRORS.some((k) => k === code)) return { key: `runs.ingestError.${code}`, values: {} };
  return null;
}
