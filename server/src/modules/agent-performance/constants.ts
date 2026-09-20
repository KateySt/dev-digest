/** Constants for the agent-performance module. */

/** How many recent runs feed the Stats tab's trend sparkline / Agent
 *  Performance page's per-agent trend column. */
export const TREND_RUN_LIMIT = 10;

/** Default page size for GET /agents/:id/runs (the Stats tab's run-history
 *  table) when no `?limit=` is given. */
export const DEFAULT_RUNS_LIMIT = 20;
