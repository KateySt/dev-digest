"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Donut, ErrorState, MetricCard, Select, Skeleton, Sparkline } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useAgentPerformance } from "../../../../lib/hooks/agent-performance";
import { formatRunCost } from "../../../../components/run-cost-badge";
import { SORT_KEYS, type SortKey } from "./constants";
import { sortAgents, toDonutSegments } from "./helpers";
import { s } from "./styles";

export function AgentPerformanceView() {
  const t = useTranslations("agentPerformance");
  const { data, isLoading, isError, refetch } = useAgentPerformance();
  const [sortKey, setSortKey] = React.useState<SortKey>("runs");

  return (
    <AppShell crumb={[{ label: t("title") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>{t("title")}</h1>
          <p style={s.subtitle}>{t("subtitle")}</p>
        </div>

        {isLoading && (
          <div style={s.tileRow}>
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={90} />
          </div>
        )}
        {isError && <ErrorState body={t("loadError")} onRetry={() => refetch()} />}

        {data && (
          <>
            <div style={s.tileRow}>
              <MetricCard label={t("summary.totalRuns")} value={data.summary.runs} />
              <MetricCard
                label={t("summary.totalCost")}
                value={data.summary.total_cost_usd != null ? formatRunCost(data.summary.total_cost_usd) : "—"}
              />
              <MetricCard
                label={t("summary.avgAcceptRate")}
                value={data.summary.avg_accept_rate != null ? Math.round(data.summary.avg_accept_rate * 100) : "—"}
                suffix={data.summary.avg_accept_rate != null ? "%" : undefined}
              />
              <MetricCard label={t("summary.mostActive")} value={data.summary.most_active_agent ?? "—"} />
            </div>

            <div style={s.donutRow}>
              <div style={s.donutCol}>
                <div style={s.sectionTitle}>{t("costByAgent")}</div>
                {data.cost_by_agent.length === 0 ? (
                  <div>{t("noCost")}</div>
                ) : (
                  <Donut segments={toDonutSegments(data.cost_by_agent)} />
                )}
              </div>
              <div style={s.donutCol}>
                <div style={s.sectionTitle}>{t("costByModel")}</div>
                {data.cost_by_model.length === 0 ? (
                  <div>{t("noCost")}</div>
                ) : (
                  <Donut segments={toDonutSegments(data.cost_by_model)} />
                )}
              </div>
            </div>

            {data.agents.length === 0 ? (
              <div>
                <div style={s.sectionTitle}>{t("empty.title")}</div>
                <div>{t("empty.body")}</div>
              </div>
            ) : (
              <div>
                <div style={s.tableHeader}>
                  <div style={s.sectionTitle}>{t("perAgent")}</div>
                  <div style={s.sortWrap}>
                    <Select
                      value={sortKey}
                      onChange={(v) => setSortKey(v as SortKey)}
                      options={SORT_KEYS.map((k) => ({ value: k, label: t(`sort.${k}`) }))}
                    />
                  </div>
                </div>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>{t("table.agent")}</th>
                      <th style={s.th}>{t("table.accept")}</th>
                      <th style={s.th}>{t("table.runs")}</th>
                      <th style={s.th}>{t("table.findings")}</th>
                      <th style={s.th}>{t("table.cost")}</th>
                      <th style={s.th}>{t("table.trend")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortAgents(data.agents, sortKey).map((row) => (
                      <tr key={row.agent_id}>
                        <td style={{ ...s.td, ...s.agentName }}>{row.agent_name}</td>
                        <td style={s.td}>{row.accept_rate != null ? `${Math.round(row.accept_rate * 100)}%` : "—"}</td>
                        <td style={s.td}>{row.runs}</td>
                        <td style={s.td}>{row.findings_total}</td>
                        <td style={s.td}>{row.total_cost_usd != null ? formatRunCost(row.total_cost_usd) : "—"}</td>
                        <td style={s.td}>
                          {row.trend.length > 0 && <Sparkline data={row.trend} w={64} h={20} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
