export const STATUS_VALUES = ["succeeded", "no_findings", "failed", "running"] as const;

/** How often to re-fetch while "auto-refresh" is on (ms). */
export const AUTO_REFRESH_INTERVAL_MS = 10_000;
