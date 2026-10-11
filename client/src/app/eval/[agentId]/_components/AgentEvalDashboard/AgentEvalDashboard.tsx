"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { EvalRange } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { type TrendPoint } from "@/components/eval-metrics";
import { MetricCards, RegressionBanner, RunsTable, TrendPanel } from "@/components/eval-dashboard";
import { notify } from "@/lib/contexts/toast";
import { useAgent, useAgents } from "@/lib/hooks/agents";
import { useAgentEvalRuns, useEvalSuiteRun, useStartAgentEvalRun } from "@/lib/hooks/eval-runs";
import { RANGE_OPTIONS, parseRange } from "@/lib/eval";
import { CompareRunsModal } from "./_components/CompareRunsModal";
import { s } from "./styles";

/** Per-agent eval dashboard (`/eval/[agentId]?range=`): regression banner,
 *  metric cards + sparklines (latest finished run vs. previous, independent of
 *  range), three-series trend, selectable runs table, Compare. */
export function AgentEvalDashboard() {
  const t = useTranslations("evalAgent");
  const tm = useTranslations("evalMetrics");
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
  useEvalSuiteRun(started?.runId, started ? { kind: "agent", id: started.agentId } : null);
  const ownStarted = started?.agentId === agentId ? started.runId : null;
  const serverRunning = runs.data?.runs.find((r) => r.status === "running") ?? null;
  const activeRunId = ownStarted ?? serverRunning?.id ?? null;
  const active = useEvalSuiteRun(activeRunId, { kind: "agent", id: agentId });
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

            <TrendPanel points={trend} />

            <div style={s.runsHead}>
              <span style={s.sectionLabel}>
                <Icon.History size={14} />
                {t("runs.title")}
              </span>
              {selectedIds.length > 0 && <span style={s.selectedNote}>{tm("runs.selected", { count: selectedIds.length })}</span>}
              <span style={s.compareBtn} title={canCompare ? undefined : tm("runs.compareHint")}>
                <Button
                  kind="primary"
                  icon="Link"
                  disabled={!canCompare}
                  aria-describedby={canCompare ? undefined : "compare-hint"}
                  onClick={() => setCompare([selectedIds[0]!, selectedIds[1]!])}
                >
                  {tm("runs.compare")}
                </Button>
                {!canCompare && (
                  <span id="compare-hint" style={s.srOnly}>
                    {tm("runs.compareHint")}
                  </span>
                )}
              </span>
            </div>
            <div style={s.tableWrap}>
              {data.runs.length === 0 ? (
                <div style={s.muted}>{tm("runs.emptyRange")}</div>
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
