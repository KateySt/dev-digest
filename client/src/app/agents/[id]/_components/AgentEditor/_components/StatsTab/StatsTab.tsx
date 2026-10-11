"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, MetricCard, BarRow, Skeleton, EmptyState } from "@devdigest/ui";
import type { Agent, Severity } from "@devdigest/shared";
import { useAgentStats, useAgentRuns } from "../../../../../../../lib/hooks/agent-performance";
import { RunCostBadge, formatRunCost, formatTokens } from "../../../../../../../components/run-cost-badge";
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import { SEVERITY_COLOR, SEVERITY_ORDER, DEFAULT_RUNS_LIMIT } from "./constants";
import { formatSeconds, formatTimestamp } from "./helpers";
import { s } from "./styles";

/** Stats tab — per-agent aggregates (Total runs / Avg cost / Avg duration /
 *  Accept rate), findings by severity, and a run-history table with a
 *  "View trace" action that reuses the PR page's RunTraceDrawer. */
export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: stats, isLoading, isError, refetch } = useAgentStats(agent.id);
  const { data: runs } = useAgentRuns(agent.id, DEFAULT_RUNS_LIMIT);
  const [traceRunId, setTraceRunId] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <div style={s.tileRow}>
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </div>
        <Skeleton height={160} />
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
    <div style={s.wrap}>
      <div style={s.tileRow}>
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
        <div style={s.sectionTitle}>{t("stats.findingsBySeverity")}</div>
        {stats.findings_total === 0 ? (
          <div style={s.emptyNote}>{t("stats.noFindings")}</div>
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
        <div style={s.sectionTitle}>{t("stats.runHistory")}</div>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>{t("stats.table.timestamp")}</th>
              <th style={s.th}>{t("stats.table.pr")}</th>
              <th style={s.th}>{t("stats.table.tokens")}</th>
              <th style={s.th}>{t("stats.table.cost")}</th>
              <th style={s.th}>{t("stats.table.findings")}</th>
              <th style={s.th}>{t("stats.table.source")}</th>
              <th style={s.th} />
            </tr>
          </thead>
          <tbody>
            {(runs ?? []).map((run) => (
              <tr key={run.run_id}>
                <td style={s.td}>{formatTimestamp(run.ran_at)}</td>
                <td style={s.td}>{run.pr_number != null ? `#${run.pr_number}` : "—"}</td>
                <td className="mono" style={s.td}>
                  {run.tokens_in != null && run.tokens_out != null
                    ? `${formatTokens(run.tokens_in)}→${formatTokens(run.tokens_out)}`
                    : "—"}
                </td>
                <td style={s.td}>
                  <RunCostBadge costUsd={run.cost_usd} variant="compact" />
                </td>
                <td style={s.td}>{run.findings_count ?? "—"}</td>
                <td style={s.td}>
                  <Badge color="var(--text-secondary)" mono>
                    {run.status ?? "—"}
                  </Badge>
                </td>
                <td style={s.td}>
                  <button style={s.viewTraceBtn} onClick={() => setTraceRunId(run.run_id)}>
                    {t("stats.viewTrace")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
