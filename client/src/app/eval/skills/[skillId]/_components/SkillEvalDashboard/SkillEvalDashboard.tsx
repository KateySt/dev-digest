"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
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
import type { TrendPoint } from "@/components/eval-metrics";
import { MetricCards, RegressionBanner, RunsTable, TrendPanel } from "@/components/eval-dashboard";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/contexts";
import { useSkill, useSkills } from "@/lib/hooks/skills";
import { useSkillEvalActivity, useSkillEvalRuns } from "@/lib/hooks/eval-runs";
import { RANGE_OPTIONS, parseRange } from "@/lib/eval";
import { runBlockText } from "@/lib/skill-scan";
import { SKILL_TYPE_BADGE } from "@/lib/skill-constants";
import { cn } from "@/lib/utils";
import { SkillCompareRunsModal } from "./_components/SkillCompareRunsModal";

/** Long unbroken strings wrap (client/INSIGHTS.md 2026-09-24). */
const WRAP = "min-w-0 break-words wrap-anywhere";
const PAGE = "mx-auto max-w-[1100px] px-8 pt-6 pb-11";
const CHIP = cn("mono rounded-md border border-border-strong px-2.25 py-0.5 text-ui text-muted-foreground", WRAP);

/** Per-skill eval dashboard (`/eval/skills/[skillId]?range=`): regression
 *  banner, metric cards + sparklines (latest finished run vs. previous,
 *  independent of range), three-series trend, selectable runs table, Compare.
 *  Mirrors the per-agent dashboard on the shared `eval-dashboard` parts. */
export function SkillEvalDashboard() {
  const t = useTranslations("evalSkill");
  const tm = useTranslations("evalMetrics");
  const ts = useTranslations("skills");
  const { skillId } = useParams<{ skillId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const range = parseRange(search.get("range"));

  const skillQuery = useSkill(skillId);
  const skill = skillQuery.data;
  const { data: skills } = useSkills();
  const runs = useSkillEvalRuns(skillId, range);
  // Run controller: remembers the run started here as {skillId, runId} so it
  // keeps polling after the user switches skills in the picker.
  const activity = useSkillEvalActivity(skillId, skill);
  const blockText = runBlockText(ts, activity.disabledReason);

  const [selected, setSelected] = React.useState<string[]>([]);
  const [compare, setCompare] = React.useState<[string, string] | null>(null);

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval?tab=skills" },
    { label: skill?.name ?? t("page.skillFallback") },
  ];

  const setRange = (next: EvalRange) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("range", next);
    router.replace(`/eval/skills/${skillId}?${sp.toString()}`);
  };

  const data = runs.data;
  // Derived: selection restricted to runs currently listed (range changes can drop some).
  const listedIds = new Set((data?.runs ?? []).map((r) => r.id));
  const selectedIds = selected.filter((id) => listedIds.has(id));
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const canCompare = selectedIds.length === 2;

  const runLabel = activity.progress
    ? t("header.runningProgress", { done: activity.progress.done, total: activity.progress.total })
    : t("header.runEval");

  // The trend follows the range selector (completed runs in range, oldest first);
  // cards + banner keep using the all-time `history`.
  const trend: TrendPoint[] = (data?.runs ?? [])
    .filter((r) => r.status === "completed")
    .reverse()
    .map((r) => ({ recall: r.recall, precision: r.precision, citation_accuracy: r.citation_accuracy }));
  const neverRun = !!data && data.runs.length === 0 && data.history.length === 0;

  const notFound =
    (skillQuery.error instanceof ApiError && skillQuery.error.status === 404) ||
    (runs.error instanceof ApiError && runs.error.status === 404);
  if (notFound) {
    return (
      <AppShell crumb={crumb}>
        <div className={PAGE}>
          <ErrorState title={t("notFound.title")} body={t("notFound.body")} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div className={PAGE}>
        <Link
          href="/eval?tab=skills"
          className="mb-3.5 inline-flex items-center gap-1.5 text-[13.5px] text-muted-foreground no-underline"
        >
          <Icon.ChevronLeft size={14} aria-hidden />
          {t("header.back")}
        </Link>

        <div className="mb-4.5 flex flex-wrap items-start gap-4">
          <div className="min-w-[260px] flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className={cn("mono text-5xl font-bold tracking-[-0.02em]", WRAP)}>
                {skill?.name ?? "…"}
              </h1>
              {skill && <Badge variant={SKILL_TYPE_BADGE[skill.type]}>{ts(`listItem.type.${skill.type}`)}</Badge>}
              {skill && (
                <span className={CHIP} title={t("header.currentVersion")}>
                  v{skill.version}
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
                <Button variant="secondary" aria-label={t("header.skillPicker")}>
                  <Icon.Sparkles aria-hidden />
                  {skill?.name ?? t("page.skillFallback")}
                  <Icon.ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {(skills ?? []).map((sk) => (
                  <DropdownMenuItem key={sk.id} onSelect={() => router.push(`/eval/skills/${sk.id}?range=${range}`)}>
                    <Icon.Sparkles aria-hidden />
                    {sk.name}
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
            <Button
              onClick={() => activity.start()}
              disabled={!!activity.disabledReason || !skill}
              title={blockText}
              aria-describedby={blockText ? "run-eval-reason" : undefined}
            >
              <Icon.Play aria-hidden />
              {runLabel}
            </Button>
            {blockText && (
              <span id="run-eval-reason" className="sr-only">
                {blockText}
              </span>
            )}
          </div>
        </div>

        {activity.startError && (
          <div role="alert" className={cn("mb-4.5 rounded-lg border border-crit px-3 py-2 text-sm text-crit", WRAP)}>
            {ts("evals.startFailed", { message: activity.startError })}
          </div>
        )}

        {runs.isLoading && <Skeleton className="h-65 w-full" />}
        {runs.isError && <ErrorState body={t("loadFailed")} onRetry={() => runs.refetch()} />}

        {data?.alert && <RegressionBanner alert={data.alert} />}

        {neverRun && (
          <EmptyState
            icon="FlaskConical"
            title={t("empty.title")}
            body={data.cases_total === 0 ? t("empty.noCases") : t("empty.body")}
            cta={data.cases_total > 0 && !activity.disabledReason ? t("header.runEval") : undefined}
            onCta={() => activity.start()}
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
                <RunsTable runs={data.runs} selected={selectedIds} onToggle={toggle} showModel />
              )}
            </div>
          </>
        )}
      </div>

      {compare && (
        <SkillCompareRunsModal
          skillId={skillId}
          runIds={compare}
          currentVersion={skill?.version}
          onClose={() => setCompare(null)}
          onPromoted={(version) => notify.success(t("header.promotedToast", { name: skill?.name ?? "", version }))}
        />
      )}
    </AppShell>
  );
}
