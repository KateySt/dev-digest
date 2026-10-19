"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { BarRow, MetricCard } from "@/components/charts";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Agent, Severity } from "@devdigest/shared";
import { useAgentStats, useAgentRunsPage } from "@/lib/hooks/agent-performance";
import { DataPagination, usePageState, usePagedList } from "@/components/pagination";
import { RunCostBadge, formatRunCost, formatTokens } from "@/components/run-cost-badge";
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import { SEVERITY_COLOR, SEVERITY_ORDER } from "./constants";
import { formatSeconds, formatTimestamp } from "./helpers";

const TH =
  "border-b border-border px-2.5 pb-2 text-left text-2xs font-semibold tracking-[0.03em] text-subtle-foreground uppercase";
const TD = "border-b border-border p-2.5 text-sm text-muted-foreground";

/** Stats tab — per-agent aggregates (Total runs / Avg cost / Avg duration /
 *  Accept rate), findings by severity, and a run-history table with a
 *  "View trace" action that reuses the PR page's RunTraceDrawer. */
export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: stats, isLoading, isError, refetch } = useAgentStats(agent.id);
  // Run history is server-paged (it grows with every review); the URL keys are prefixed
  // because the editor shares its URL with the rest of the Agents page.
  const pageState = usePageState({ listKey: "agent-runs", urlPrefix: "history" });
  const runsPage = useAgentRunsPage(agent.id, pageState.page, pageState.pageSize);
  const runs = runsPage.data?.items;
  const pager = usePagedList({
    listKey: "agent-runs",
    urlPrefix: "history",
    server: true,
    total: runsPage.data?.total,
    busy: runsPage.isPlaceholderData,
  });
  const [traceRunId, setTraceRunId] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex max-w-[900px] flex-col gap-7">
        <div className="flex gap-3.5">
          <Skeleton className="h-22.5 flex-1" />
          <Skeleton className="h-22.5 flex-1" />
          <Skeleton className="h-22.5 flex-1" />
          <Skeleton className="h-22.5 flex-1" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !stats) {
    return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;
  }

  if (stats.runs === 0) {
    return <EmptyState icon="Gauge" title={t("stats.empty.title")} body={t("stats.empty.body")} />;
  }

  const trend = stats.trend.map((p) => p.value);
  const maxSeverity = Math.max(1, ...SEVERITY_ORDER.map((sev) => stats.findings_by_severity[sev]));
  const traceRun = runs?.find((r) => r.run_id === traceRunId);

  return (
    <div className="flex max-w-[900px] flex-col gap-7">
      <div className="flex gap-3.5">
        <MetricCard label={t("stats.tiles.totalRuns")} value={stats.runs} trend={trend} />
        <MetricCard
          label={t("stats.tiles.avgCost")}
          value={stats.avg_cost_usd != null ? formatRunCost(stats.avg_cost_usd) : "—"}
        />
        <MetricCard
          label={t("stats.tiles.avgDuration")}
          value={stats.avg_latency_ms != null ? formatSeconds(stats.avg_latency_ms) : "—"}
        />
        <MetricCard
          label={t("stats.tiles.acceptRate")}
          value={stats.accept_rate != null ? Math.round(stats.accept_rate * 100) : "—"}
          suffix={stats.accept_rate != null ? "%" : undefined}
        />
      </div>

      <div>
        <div className="mb-3 text-base font-bold">{t("stats.findingsBySeverity")}</div>
        {stats.findings_total === 0 ? (
          <div className="text-sm text-subtle-foreground">{t("stats.noFindings")}</div>
        ) : (
          SEVERITY_ORDER.map((sev: Severity) => (
            <BarRow
              key={sev}
              label={t(`stats.severity.${sev}`)}
              value={stats.findings_by_severity[sev]}
              max={maxSeverity}
              color={SEVERITY_COLOR[sev]}
              suffix={String(stats.findings_by_severity[sev])}
            />
          ))
        )}
      </div>

      <div>
        <div className="mb-3 text-base font-bold">{t("stats.runHistory")}</div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>{t("stats.table.timestamp")}</th>
              <th className={TH}>{t("stats.table.pr")}</th>
              <th className={TH}>{t("stats.table.tokens")}</th>
              <th className={TH}>{t("stats.table.cost")}</th>
              <th className={TH}>{t("stats.table.findings")}</th>
              <th className={TH}>{t("stats.table.source")}</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {(runs ?? []).map((run) => (
              <tr key={run.run_id}>
                <td className={TD}>{formatTimestamp(run.ran_at)}</td>
                <td className={TD}>{run.pr_number != null ? `#${run.pr_number}` : "—"}</td>
                <td className={`mono ${TD}`}>
                  {run.tokens_in != null && run.tokens_out != null
                    ? `${formatTokens(run.tokens_in)}→${formatTokens(run.tokens_out)}`
                    : "—"}
                </td>
                <td className={TD}>
                  <RunCostBadge costUsd={run.cost_usd} variant="compact" />
                </td>
                <td className={TD}>{run.findings_count ?? "—"}</td>
                <td className={TD}>
                  <Badge variant="neutral" className="mono">
                    {run.status ?? "—"}
                  </Badge>
                </td>
                <td className={TD}>
                  <button
                    type="button"
                    className="cursor-pointer border-none bg-transparent p-0 text-ui text-primary hover:underline"
                    onClick={() => setTraceRunId(run.run_id)}
                  >
                    {t("stats.viewTrace")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DataPagination pager={pager} className="mt-3" />

      {traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          agentName={agent.name}
          prNumber={traceRun?.pr_number ?? null}
          onClose={() => setTraceRunId(null)}
        />
      )}
    </div>
  );
}
