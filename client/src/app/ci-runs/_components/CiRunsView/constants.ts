import type { CiRunPeriod } from "@/lib/hooks/ci";

export const STATUS_VALUES = ["succeeded", "no_findings", "failed", "running"] as const;

/** Sources a CI run can come from (only GitHub Actions is implemented). */
export const SOURCE_VALUES = ["gha"] as const;

export const PERIOD_VALUES: readonly CiRunPeriod[] = ["24h", "7d", "30d"];
export const DEFAULT_PERIOD: CiRunPeriod = "7d";

/** How often auto-refresh runs sync + refetch (ms). The server throttles sync at 30 s. */
export const AUTO_REFRESH_INTERVAL_MS = 60_000;
