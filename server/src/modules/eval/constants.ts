/** Constants for the eval module. */

/** How many recent eval_runs rows feed the Eval Dashboard's trend chart. */
export const DASHBOARD_TREND_LIMIT = 15;

/** Default page size for the Eval Dashboard's "recent runs" table. */
export const DASHBOARD_RECENT_RUNS_LIMIT = 20;

/** Baseline system prompt for a skill-owned eval run — a skill has no
 *  agent/system_prompt of its own to review with, so this is the minimal
 *  "just follow the skill" instruction the skill's rules get layered onto. */
export const SKILL_EVAL_SYSTEM_PROMPT =
  'You are a PR reviewer. Follow the skill/rules provided below strictly and report only what they call for.';
