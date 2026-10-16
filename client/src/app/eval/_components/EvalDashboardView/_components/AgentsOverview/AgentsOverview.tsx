"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkline } from "@/components/charts";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { EvalDashboardAgent, EvalDashboardRun } from "@devdigest/shared";
import { MetricBar, MetricValue, RunStatusChip } from "@/components/eval-metrics";
import { useEvalCrossDashboard, useRunAllAgents } from "@/lib/hooks/eval-dashboard";
import { METRICS, formatRanAt } from "@/lib/eval";
import { cn } from "@/lib/utils";
import { C } from "../../constants";

const SHORT_LABEL = { recall: "recall", precision: "precision", citation_accuracy: "citation" } as const;

/** Agents tab of the Eval Dashboard (`/eval`): one card per agent (latest
 *  finished run, sparkline, recall/prec/cite, running state), "Run all agents",
 *  and the recent suite runs across agents. Polls (via the hook) while any
 *  agent runs. */
export function AgentsOverview() {
  const t = useTranslations("evalDashboard");
  const { data, isLoading, isError, refetch } = useEvalCrossDashboard();
  const runAll = useRunAllAgents();
  const eligible = (data?.agents ?? []).some((a) => a.cases_total > 0);
  const anyRunning = (data?.agents ?? []).some((a) => a.running_run);

  return (
    <>
      <div className={C.header}>
        <div className={C.headerText}>
          <h1 className={C.h1}>{t("title")}</h1>
          <p className={C.subtitle}>{t("subtitle")}</p>
        </div>
        <Button onClick={() => runAll.mutate()} disabled={runAll.isPending || anyRunning || !eligible}>
          <Icon.Play aria-hidden />
          {runAll.isPending ? t("runAllStarting") : t("runAll")}
        </Button>
      </div>
      {runAll.data && (
        <div role="status" className={C.notice}>
          {t("runAllResult", { started: runAll.data.started.length, skipped: runAll.data.skipped.length })}
        </div>
      )}

      {isLoading && (
        <>
          <Skeleton className="h-22.5 w-full" />
          <Skeleton className="h-40 w-full" />
        </>
      )}
      {isError && <ErrorState body={t("loadFailed")} onRetry={() => refetch()} />}

      {data && (
        <>
          <h2 className={C.sectionLabel}>
            <Icon.Cpu size={14} aria-hidden />
            {t("agents.title")}
          </h2>
          {data.agents.length === 0 ? (
            <EmptyState icon="FlaskConical" title={t("title")} body={t("agents.noAgents")} />
          ) : (
            <div className={C.list}>
              {data.agents.map((a) => (
                <AgentCard key={a.agent_id} agent={a} />
              ))}
            </div>
          )}

          <h2 className={C.sectionLabel}>
            <Icon.History size={14} aria-hidden />
            {t("recent.title")}
          </h2>
          <div className={C.tableWrap}>
            {data.recent_runs.length === 0 ? (
              <div className={C.muted}>{t("recent.empty")}</div>
            ) : (
              <RecentRunsTable runs={data.recent_runs} />
            )}
          </div>
        </>
      )}
    </>
  );
}

function AgentCard({ agent }: { agent: EvalDashboardAgent }) {
  const t = useTranslations("evalDashboard");
  const run = agent.latest_run;
  const sparkData = agent.history.map((h) => h.recall).filter((v): v is number => v != null);

  return (
    <Link href={`/eval/${agent.agent_id}`} className={C.card} aria-label={t("agents.open", { name: agent.agent_name })}>
      <span className={C.iconTile}>
        <Icon.Cpu size={18} aria-hidden />
      </span>
      <div className={C.main}>
        <div className={C.titleRow}>
          <span className={C.name}>{agent.agent_name}</span>
          <span className={C.modelChip}>
            {agent.model}
          </span>
        </div>
        <div className={C.meta}>
          {agent.running_run ? (
            <span className={C.runningNote}>
              {t("agents.running", { done: agent.running_run.cases_done, total: agent.running_run.cases_total })}
            </span>
          ) : run ? (
            t("agents.lastRun", {
              version: run.agent_version,
              ranAt: formatRanAt(run.started_at),
              passed: run.passed_count,
              evaluated: run.evaluated_count,
            })
          ) : (
            t("agents.neverRun")
          )}
        </div>
      </div>
      {sparkData.length > 0 && (
        <span className={C.sparkWrap}>
          <Sparkline data={sparkData} color="var(--accent)" w={84} h={28} />
        </span>
      )}
      <div className={C.metrics}>
        {METRICS.map((m) => (
          <div key={m.key} className={C.metric}>
            <span className={C.metricLabel}>{t(`agents.${SHORT_LABEL[m.key]}`)}</span>
            <MetricValue value={run?.[m.key] ?? null} metric={m.key} size={22} />
          </div>
        ))}
      </div>
      <Icon.ChevronRight size={16} className={C.chevron} aria-hidden />
    </Link>
  );
}

function RecentRunsTable({ runs }: { runs: EvalDashboardRun[] }) {
  const t = useTranslations("evalDashboard");
  const cols = ["agent", "ranAt", "version", "recall", "precision", "citation", "pass"] as const;
  return (
    <table className={C.table}>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c} scope="col" className={C.th}>
              {t(`recent.columns.${c}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id}>
            <td className={cn(C.td, C.tdName)}>{r.agent_name}</td>
            <td className={cn("mono", C.td)}>
              {formatRanAt(r.started_at)}
            </td>
            <td className={cn("mono", C.td, C.tdVersion)}>
              v{r.agent_version}
            </td>
            {METRICS.map((m) => (
              <td key={m.key} className={C.td}>
                <MetricBar value={r[m.key]} metric={m.key} barWidth={72} />
              </td>
            ))}
            <td className={cn("tnum", C.td, C.tdPass)}>
              {r.status === "completed" ? `${r.passed_count}/${r.evaluated_count}` : <RunStatusChip status={r.status} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
