"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { EvalRange, EvalRegressionAlert } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { MetricTrendChart, type TrendPoint } from "@/components/eval-metrics";
import { notify } from "@/lib/toast";
import { useAgent, useAgents } from "@/lib/hooks/agents";
import { useAgentEvalRuns, useEvalSuiteRun, useStartAgentEvalRun } from "@/lib/hooks/eval-runs";
import { METRICS, RANGE_OPTIONS, parseRange, type MetricKey } from "@/lib/eval";
import { CompareRunsModal } from "./_components/CompareRunsModal";
import { MetricCards } from "./_components/MetricCards";
import { RunsTable } from "./_components/RunsTable";
import { s } from "./styles";

/** Per-agent eval dashboard (`/eval/[agentId]?range=`): regression banner,
 *  metric cards + sparklines (latest finished run vs. previous, independent of
 *  range), three-series trend, selectable runs table, Compare. */
export function AgentEvalDashboard() {
  const t = useTranslations("evalAgent");
  const { agentId } = useParams<{ agentId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const range = parseRange(search.get("range"));

  const { data: agent } = useAgent(agentId);
  const { data: agents } = useAgents();
  const runs = useAgentEvalRuns(agentId, range);

  // The run started from this page. Remembering its agent keeps polling it
  // even if the user switches to another agent meanwhile.
  const startRun = useStartAgentEvalRun();
  const [started, setStarted] = React.useState<{ agentId: string; runId: string } | null>(null);
  useEvalSuiteRun(started?.runId, started?.agentId);
  const ownStarted = started?.agentId === agentId ? started.runId : null;
  const serverRunning = runs.data?.runs.find((r) => r.status === "running") ?? null;
  const activeRunId = ownStarted ?? serverRunning?.id ?? null;
  const active = useEvalSuiteRun(activeRunId, agentId);
  const running = startRun.isPending || active.data?.status === "running" || (!!serverRunning && !active.data);

  const [selected, setSelected] = React.useState<string[]>([]);
  const [compare, setCompare] = React.useState<[string, string] | null>(null);

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    { label: agent?.name ?? t("page.agentFallback") },
  ];

  const setRange = (next: EvalRange) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("range", next);
    router.replace(`/eval/${agentId}?${sp.toString()}`);
  };

  const data = runs.data;
  // Derived: selection restricted to runs currently listed (range changes can drop some).
  const listedIds = new Set((data?.runs ?? []).map((r) => r.id));
  const selectedIds = selected.filter((id) => listedIds.has(id));
  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const canCompare = selectedIds.length === 2;

  const handleRun = () =>
    startRun.mutate(agentId, { onSuccess: (r) => setStarted({ agentId, runId: r.run_id }) });
  const runLabel = running
    ? t("header.runningProgress", { done: active.data?.cases_done ?? 0, total: active.data?.cases_total ?? data?.cases_total ?? 0 })
    : t("header.runEval");

  // C-24: the trend follows the range selector (completed runs in range, oldest first);
  // cards + banner keep using the all-time `history` (C-25).
  const trend: TrendPoint[] = (data?.runs ?? [])
    .filter((r) => r.status === "completed")
    .reverse()
    .map((r) => ({
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citation_accuracy,
  }));
  const neverRun = !!data && data.runs.length === 0 && data.history.length === 0;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/eval" style={s.back}>
          <Icon.ChevronLeft size={14} />
          {t("header.back")}
        </Link>

        <div style={s.header}>
          <div style={s.headerText}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{agent?.name ?? "…"}</h1>
              {agent && (
                <span className="mono" style={s.chip}>
                  {agent.model}
                </span>
              )}
              {agent && (
                <span className="mono" style={s.chip} title={t("header.currentVersion")}>
                  v{agent.version}
                </span>
              )}
            </div>
            {data && (
              <p style={s.subtitle}>{t("header.subtitle", { runs: data.runs.length, cases: data.cases_total })}</p>
            )}
          </div>
          <div style={s.controls}>
            <Dropdown
              width={240}
              align="right"
              trigger={
                <Button kind="secondary" icon="Cpu" iconRight="ChevronDown" aria-label={t("header.agentPicker")}>
                  {agent?.name ?? t("page.agentFallback")}
                </Button>
              }
              items={(agents ?? []).map((a) => ({
                label: a.name,
                icon: "Cpu" as const,
                onClick: () => router.push(`/eval/${a.id}?range=${range}`),
              }))}
            />
            <Dropdown
              width={160}
              align="right"
              trigger={
                <Button kind="secondary" icon="Calendar" aria-label={t("header.rangeLabel")}>
                  {t(`ranges.${range}`)}
                </Button>
              }
              items={RANGE_OPTIONS.map((r) => ({ label: t(`ranges.${r}`), onClick: () => setRange(r) }))}
            />
            <Button kind="primary" icon="Play" onClick={handleRun} disabled={running}>
              {runLabel}
            </Button>
          </div>
        </div>

        {runs.isLoading && <Skeleton height={260} />}
        {runs.isError && <ErrorState body={t("compare.loadFailed")} onRetry={() => runs.refetch()} />}

        {data?.alert && <RegressionBanner alert={data.alert} />}

        {neverRun && (
          <EmptyState
            icon="FlaskConical"
            title={t("empty.title")}
            body={data.cases_total === 0 ? t("empty.noCases") : t("empty.body")}
            cta={data.cases_total > 0 && !running ? t("header.runEval") : undefined}
            onCta={handleRun}
          />
        )}

        {data && !neverRun && (
          <>
            <MetricCards history={data.history} />

            <div style={s.panel}>
              <div style={s.panelHead}>
                <span style={s.sectionLabel}>
                  <Icon.TrendingUp size={14} />
                  {t("trend.title")}
                </span>
                <div style={s.legend}>
                  {METRICS.map((m) => (
                    <span key={m.key} style={s.legendItem}>
                      <span style={s.legendDash(m.color)} />
                      {t(`trend.${m.key === "citation_accuracy" ? "citation" : (m.key as Exclude<MetricKey, "citation_accuracy">)}`)}
                    </span>
                  ))}
                </div>
              </div>
              <MetricTrendChart points={trend} />
            </div>

            <div style={s.runsHead}>
              <span style={s.sectionLabel}>
                <Icon.History size={14} />
                {t("runs.title")}
              </span>
              {selectedIds.length > 0 && <span style={s.selectedNote}>{t("runs.selected", { count: selectedIds.length })}</span>}
              <span style={s.compareBtn} title={canCompare ? undefined : t("runs.compareHint")}>
                <Button
                  kind="primary"
                  icon="Link"
                  disabled={!canCompare}
                  aria-describedby={canCompare ? undefined : "compare-hint"}
                  onClick={() => setCompare([selectedIds[0]!, selectedIds[1]!])}
                >
                  {t("runs.compare")}
                </Button>
                {!canCompare && (
                  <span id="compare-hint" style={s.srOnly}>
                    {t("runs.compareHint")}
                  </span>
                )}
              </span>
            </div>
            <div style={s.tableWrap}>
              {data.runs.length === 0 ? (
                <div style={s.muted}>{t("runs.emptyRange")}</div>
              ) : (
                <RunsTable runs={data.runs} selected={selectedIds} onToggle={toggle} />
              )}
            </div>
          </>
        )}
      </div>

      {compare && (
        <CompareRunsModal
          agentId={agentId}
          runIds={compare}
          currentVersion={agent?.version}
          onClose={() => setCompare(null)}
          onPromoted={(version) => notify.success(t("header.promotedToast", { name: agent?.name ?? "", version }))}
        />
      )}
    </AppShell>
  );
}

/** Warning banner built from the server alert's structured fields (i18n). */
function RegressionBanner({ alert }: { alert: EvalRegressionAlert }) {
  const t = useTranslations("evalAgent");
  const lead = alert.drops
    .map((d) => t("banner.dipped", { metric: t(`metrics.${d.metric}`), points: Math.round(d.points * 10) / 10 }))
    .join(", ");
  const others = alert.others.map((o) => t(`banner.${o.direction}`, { metric: t(`metrics.${o.metric}`) })).join(", ");
  return (
    <div role="status" style={s.banner}>
      <Icon.AlertTriangle size={18} style={{ color: "var(--warn)", flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span style={s.bannerLead}>{lead}</span>{" "}
        {t("banner.context", { version: alert.version, previous: alert.previous_version })}
        {others && ` ${others}.`}
      </span>
    </div>
  );
}
