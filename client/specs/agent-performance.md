# Agent Performance — global page + Agent Editor "Stats" tab

**Status: implemented.** Built against `AgentStats`/`AgentPerf` (already
defined in `server/src/vendor/shared/contracts/observability.ts` and
`productionize.ts` before this spec was written), plus one small additive
contract change (`RunSummary` gained `pr_number`) for the Stats tab's run
history table.

**Confirmed with the user: this is ONE feature, not two.** The per-agent
"Stats" tab and the global "Agent Performance" page share the same
`server/src/modules/agent-performance/` aggregation — the Stats tab is that
data filtered to one `agentId`, not a separately-built feature.

## What was built

- Server: `server/src/modules/agent-performance/` (`AgentPerformanceRepository`
  fetches `agent_runs` + `findings ⟕ reviews` rows; `helpers.ts`'s
  `computeAggregate` — pure, unit-tested — turns them into the
  `AgentStats`/`AgentPerfRow` numeric core: `accept_rate`/`dismiss_rate` over
  ACTED findings only (pending excluded from the denominator),
  `avg_cost_usd`/`avg_latency_ms` averaged over non-null values only, not
  diluted by unpriced/untimed runs). Routes: `GET /agents/:id/stats`,
  `GET /agents/:id/runs`, `GET /agents/performance`.
- Client: `AgentCard`'s new perf line (fed by ONE workspace-wide
  `useAgentPerformance()` call at the `AgentsListView` level, not one query
  per card), the Agent Editor's `StatsTab` (`MetricCard` tiles, `BarRow`
  findings-by-severity, a run-history table reusing `RunTraceDrawer` for
  "View trace"), and the global `/agent-performance` page (`Donut`s for
  cost-by-agent/cost-by-model, a sortable `AgentPerfRow` table with a
  `Sparkline` trend column).

## Deliberately not built (scope note for later)

- **"Findings by category" donut** and **"most-used skills"/"most-pulled
  memory"** bars from the original mockup — neither `AgentStats` nor
  `AgentPerfRow` has a field for them; building exactly what was already
  contracted rather than extending the contract to chase the mockup further.
  "Most-used skills" is a natural pairing with `[[skills]]` once picked back
  up; "most-pulled memory" is blocked on the (also unbuilt) Memory feature.
