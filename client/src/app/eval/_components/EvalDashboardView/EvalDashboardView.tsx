"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton, Sparkline } from "@devdigest/ui";
import type { EvalDashboardAgent, EvalDashboardRun } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { MetricBar, MetricValue, RunStatusChip } from "@/components/eval-metrics";
import { useEvalCrossDashboard, useRunAllAgents } from "@/lib/hooks/eval-dashboard";
import { METRICS, formatRanAt } from "@/lib/eval";
import { s } from "./styles";

const SHORT_LABEL = { recall: "recall", precision: "precision", citation_accuracy: "citation" } as const;

/** Cross-agent Eval Dashboard (`/eval`): one card per agent (latest finished
 *  run, sparkline, recall/prec/cite, running state), "Run all agents", and the
 *  recent suite runs across agents. Polls (via the hook) while any agent runs. */
export function EvalDashboardView() {
  const t = useTranslations("evalDashboard");
  const { data, isLoading, isError, refetch } = useEvalCrossDashboard();
  const runAll = useRunAllAgents();
  const eligible = (data?.agents ?? []).some((a) => a.cases_total > 0);
  const anyRunning = (data?.agents ?? []).some((a) => a.running_run);

  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <Button
            kind="primary"
            icon="Play"
            onClick={() => runAll.mutate()}
            disabled={runAll.isPending || anyRunning || !eligible}
          >
            {runAll.isPending ? t("runAllStarting") : t("runAll")}
          </Button>
        </div>
        {runAll.data && (
          <div role="status" style={s.notice}>
            {t("runAllResult", { started: runAll.data.started.length, skipped: runAll.data.skipped.length })}
          </div>
        )}

        {isLoading && (
          <>
            <Skeleton height={90} />
            <Skeleton height={160} />
          </>
        )}
        {isError && <ErrorState body={t("loadFailed")} onRetry={() => refetch()} />}

        {data && (
          <>
            <h2 style={s.sectionLabel}>
              <Icon.Cpu size={14} />
              {t("agents.title")}
            </h2>
            {data.agents.length === 0 ? (
              <EmptyState icon="FlaskConical" title={t("title")} body={t("agents.noAgents")} />
            ) : (
              <div style={s.agentList}>
                {data.agents.map((a) => (
                  <AgentCard key={a.agent_id} agent={a} />
                ))}
              </div>
            )}

            <h2 style={s.sectionLabel}>
              <Icon.History size={14} />
              {t("recent.title")}
            </h2>
            <div style={s.tableWrap}>
              {data.recent_runs.length === 0 ? (
                <div style={s.muted}>{t("recent.empty")}</div>
              ) : (
                <RecentRunsTable runs={data.recent_runs} />
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function AgentCard({ agent }: { agent: EvalDashboardAgent }) {
  const t = useTranslations("evalDashboard");
  const run = agent.latest_run;
  const sparkData = agent.history.map((h) => h.recall).filter((v): v is number => v != null);

  return (
    <Link href={`/eval/${agent.agent_id}`} style={s.agentCard} aria-label={t("agents.open", { name: agent.agent_name })}>
      <span style={s.iconTile}>
        <Icon.Cpu size={18} />
      </span>
      <div style={s.agentMain}>
        <div style={s.agentTitleRow}>
          <span style={s.agentName}>{agent.agent_name}</span>
          <span className="mono" style={s.modelChip}>
            {agent.model}
          </span>
        </div>
        <div style={s.agentMeta}>
          {agent.running_run ? (
            <span style={s.runningNote}>
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
        <span style={s.sparkWrap}>
          <Sparkline data={sparkData} color="var(--accent)" w={84} h={28} />
        </span>
      )}
      <div style={s.metrics}>
        {METRICS.map((m) => (
          <div key={m.key} style={s.metric}>
            <span style={s.metricLabel}>{t(`agents.${SHORT_LABEL[m.key]}`)}</span>
            <MetricValue value={run?.[m.key] ?? null} color={m.color} size={22} />
          </div>
        ))}
      </div>
      <Icon.ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
    </Link>
  );
}

function RecentRunsTable({ runs }: { runs: EvalDashboardRun[] }) {
  const t = useTranslations("evalDashboard");
  const cols = ["agent", "ranAt", "version", "recall", "precision", "citation", "pass"] as const;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c} scope="col" style={s.th}>
              {t(`recent.columns.${c}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id}>
            <td style={{ ...s.td, ...s.tdAgent }}>{r.agent_name}</td>
            <td className="mono" style={s.td}>
              {formatRanAt(r.started_at)}
            </td>
            <td className="mono" style={{ ...s.td, color: "var(--accent)" }}>
              v{r.agent_version}
            </td>
            {METRICS.map((m) => (
              <td key={m.key} style={s.td}>
                <MetricBar value={r[m.key]} color={m.color} barWidth={72} />
              </td>
            ))}
            <td className="tnum" style={{ ...s.td, fontWeight: 700, color: "var(--text-primary)" }}>
              {r.status === "completed" ? `${r.passed_count}/${r.evaluated_count}` : <RunStatusChip status={r.status} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
