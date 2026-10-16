"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { Donut, MetricCard, Sparkline } from "@/components/charts";
import { ErrorState } from "@/components/empty-state";
import { formatRunCost } from "@/components/run-cost-badge";
import { SelectField } from "@/components/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentPerformance } from "@/lib/hooks/agent-performance";
import { SORT_KEYS, type SortKey } from "./constants";
import { sortAgents, toDonutSegments } from "./helpers";

const SECTION_TITLE = "mb-3 text-base font-bold";
const TH =
  "border-b border-border px-2.5 pb-2 text-left text-2xs font-semibold tracking-[0.03em] text-subtle-foreground uppercase";
const TD = "border-b border-border p-2.5 text-sm text-muted-foreground";

export function AgentPerformanceView() {
  const t = useTranslations("agentPerformance");
  const { data, isLoading, isError, refetch } = useAgentPerformance();
  const [sortKey, setSortKey] = React.useState<SortKey>("runs");

  return (
    <AppShell crumb={[{ label: t("title") }]}>
      <div className="mx-auto max-w-[1100px] px-8 pt-6 pb-11">
        <div className="mb-5">
          <h1 className="text-4xl font-bold tracking-[-0.02em]">{t("title")}</h1>
          <p className="mt-1 text-base text-muted-foreground">{t("subtitle")}</p>
        </div>

        {isLoading && (
          <div className="mb-7 flex gap-3.5">
            <Skeleton className="h-22.5 flex-1" />
            <Skeleton className="h-22.5 flex-1" />
            <Skeleton className="h-22.5 flex-1" />
            <Skeleton className="h-22.5 flex-1" />
          </div>
        )}
        {isError && <ErrorState body={t("loadError")} onRetry={() => refetch()} />}

        {data && (
          <>
            <div className="mb-7 flex gap-3.5">
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

            <div className="mb-7 flex gap-8">
              <div className="flex-1">
                <div className={SECTION_TITLE}>{t("costByAgent")}</div>
                {data.cost_by_agent.length === 0 ? (
                  <div>{t("noCost")}</div>
                ) : (
                  <Donut segments={toDonutSegments(data.cost_by_agent)} />
                )}
              </div>
              <div className="flex-1">
                <div className={SECTION_TITLE}>{t("costByModel")}</div>
                {data.cost_by_model.length === 0 ? (
                  <div>{t("noCost")}</div>
                ) : (
                  <Donut segments={toDonutSegments(data.cost_by_model)} />
                )}
              </div>
            </div>

            {data.agents.length === 0 ? (
              <div>
                <div className={SECTION_TITLE}>{t("empty.title")}</div>
                <div>{t("empty.body")}</div>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-center">
                  <div className="text-base font-bold">{t("perAgent")}</div>
                  <div className="ml-auto w-40">
                    <SelectField
                      value={sortKey}
                      onChange={(v) => setSortKey(v as SortKey)}
                      options={SORT_KEYS.map((k) => ({ value: k, label: t(`sort.${k}`) }))}
                      ariaLabel={t("perAgent")}
                    />
                  </div>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={TH}>{t("table.agent")}</th>
                      <th className={TH}>{t("table.accept")}</th>
                      <th className={TH}>{t("table.runs")}</th>
                      <th className={TH}>{t("table.findings")}</th>
                      <th className={TH}>{t("table.cost")}</th>
                      <th className={TH}>{t("table.trend")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortAgents(data.agents, sortKey).map((row) => (
                      <tr key={row.agent_id}>
                        <td className={`${TD} font-semibold text-foreground`}>{row.agent_name}</td>
                        <td className={TD}>{row.accept_rate != null ? `${Math.round(row.accept_rate * 100)}%` : "—"}</td>
                        <td className={TD}>{row.runs}</td>
                        <td className={TD}>{row.findings_total}</td>
                        <td className={TD}>{row.total_cost_usd != null ? formatRunCost(row.total_cost_usd) : "—"}</td>
                        <td className={TD}>
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
