/** Constants for the eval module. */

/** Baseline system prompt for a skill-owned eval run — a skill has no
 *  agent/system_prompt of its own to review with, so this is the minimal
 *  "just follow the skill" instruction the skill's rules get layered onto. */
export const SKILL_EVAL_SYSTEM_PROMPT =
  'You are a PR reviewer. Follow the skill/rules provided below strictly and report only what they call for.';

/** How many completed suite runs feed a per-agent sparkline / history strip. */
export const EVAL_HISTORY_LIMIT = 10;

/** Page size for the cross-agent dashboard's "recent runs" table. */
export const DASHBOARD_RECENT_RUNS_LIMIT = 20;

/** Upper bound on completed suite runs scanned when building per-agent histories. */
export const DASHBOARD_HISTORY_SCAN_LIMIT = 500;

/** Minimum metric drop (in percentage points) that raises a regression alert. */
export const REGRESSION_THRESHOLD_POINTS = 1;

/** Upper line bound used for "whole file" locations (full-file findings). */
export const FULL_FILE_END_LINE = 1_000_000;

/** Fallback case name when a finding title has no usable characters. */
export const FALLBACK_CASE_NAME = 'eval-case';

/** Failure reason stamped on suite runs left `running` by a dead process. */
export const INTERRUPTED_REASON = 'interrupted';

/** Range name -> look-back window in days (`all` has no window). */
export const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;
