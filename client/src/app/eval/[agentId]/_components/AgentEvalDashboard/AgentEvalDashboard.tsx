"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { EvalRange } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { type TrendPoint } from "@/components/eval-metrics";
import { MetricCards, RegressionBanner, RunsTable, TrendPanel } from "@/components/eval-dashboard";
import { notify } from "@/lib/contexts";
import { useAgent, useAgents } from "@/lib/hooks/agents";
import { useAgentEvalRuns, useEvalSuiteRun, useStartAgentEvalRun } from "@/lib/hooks/eval-runs";
import { RANGE_OPTIONS, parseRange } from "@/lib/eval";
import { cn } from "@/lib/utils";
import { CompareRunsModal } from "./_components/CompareRunsModal";

/** Long unbroken strings wrap (client/INSIGHTS.md 2026-09-24). */
const WRAP = "min-w-0 break-words wrap-anywhere";
const CHIP = cn("mono rounded-md border border-border-strong px-2.25 py-0.5 text-ui text-muted-foreground", WRAP);

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
      <div className="mx-auto max-w-[1100px] px-8 pt-6 pb-11">
        <Link
          href="/eval"
          className="mb-3.5 inline-flex items-center gap-1.5 text-[13.5px] text-muted-foreground no-underline"
        >
          <Icon.ChevronLeft size={14} aria-hidden />
          {t("header.back")}
        </Link>

        <div className="mb-4.5 flex flex-wrap items-start gap-4">
          <div className="min-w-[260px] flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className={cn("text-5xl font-bold tracking-[-0.02em]", WRAP)}>{agent?.name ?? "…"}</h1>
              {agent && (
                <span className={CHIP}>
                  {agent.model}
                </span>
              )}
              {agent && (
                <span className={CHIP} title={t("header.currentVersion")}>
                  v{agent.version}
                </span>
              )}
            </div>
            {data && (
              <p className="mt-1.5 text-base text-muted-foreground">{t("header.subtitle", { runs: data.runs.length, cases: data.cases_total })}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" aria-label={t("header.agentPicker")}>
                  <Icon.Cpu aria-hidden />
                  {agent?.name ?? t("page.agentFallback")}
                  <Icon.ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {(agents ?? []).map((a) => (
                  <DropdownMenuItem key={a.id} onSelect={() => router.push(`/eval/${a.id}?range=${range}`)}>
                    <Icon.Cpu aria-hidden />
                    {a.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" aria-label={t("header.rangeLabel")}>
                  <Icon.Calendar aria-hidden />
                  {t(`ranges.${range}`)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {RANGE_OPTIONS.map((r) => (
                  <DropdownMenuItem key={r} onSelect={() => setRange(r)}>
                    {t(`ranges.${r}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={handleRun} disabled={running}>
              <Icon.Play aria-hidden />
              {runLabel}
            </Button>
          </div>
        </div>

        {runs.isLoading && <Skeleton className="h-65 w-full" />}
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

            <div className="mb-3 flex items-center gap-3">
              <span className="flex items-center gap-2 text-xs font-bold tracking-[0.07em] text-subtle-foreground uppercase">
                <Icon.History size={14} aria-hidden />
                {t("runs.title")}
              </span>
              {selectedIds.length > 0 && <span className="text-sm text-subtle-foreground">{tm("runs.selected", { count: selectedIds.length })}</span>}
              <span className="ml-auto" title={canCompare ? undefined : tm("runs.compareHint")}>
                <Button
                  disabled={!canCompare}
                  aria-describedby={canCompare ? undefined : "compare-hint"}
                  onClick={() => setCompare([selectedIds[0]!, selectedIds[1]!])}
                >
                  <Icon.Link aria-hidden />
                  {tm("runs.compare")}
                </Button>
                {!canCompare && (
                  <span id="compare-hint" className="sr-only">
                    {tm("runs.compareHint")}
                  </span>
                )}
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-elevated">
              {data.runs.length === 0 ? (
                <div className="px-3 py-4.5 text-[13.5px] text-subtle-foreground">{tm("runs.emptyRange")}</div>
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
