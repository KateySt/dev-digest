"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { EvalRange } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import type { TrendPoint } from "@/components/eval-metrics";
import { MetricCards, RegressionBanner, RunsTable, TrendPanel } from "@/components/eval-dashboard";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/toast";
import { useSkill, useSkills } from "@/lib/hooks/skills";
import { useSkillEvalActivity, useSkillEvalRuns } from "@/lib/hooks/eval-runs";
import { RANGE_OPTIONS, parseRange } from "@/lib/eval";
import { runBlockText } from "@/lib/skill-scan";
import { SKILL_TYPE_COLOR } from "@/lib/skill-constants";
import { SkillCompareRunsModal } from "./_components/SkillCompareRunsModal";
import { s } from "./styles";

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
        <div style={s.page}>
          <ErrorState title={t("notFound.title")} body={t("notFound.body")} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/eval?tab=skills" style={s.back}>
          <Icon.ChevronLeft size={14} />
          {t("header.back")}
        </Link>

        <div style={s.header}>
          <div style={s.headerText}>
            <div style={s.titleRow}>
              <h1 className="mono" style={s.h1}>
                {skill?.name ?? "…"}
              </h1>
              {skill && <Badge color={SKILL_TYPE_COLOR[skill.type]}>{ts(`listItem.type.${skill.type}`)}</Badge>}
              {skill && (
                <span className="mono" style={s.chip} title={t("header.currentVersion")}>
                  v{skill.version}
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
                <Button kind="secondary" icon="Sparkles" iconRight="ChevronDown" aria-label={t("header.skillPicker")}>
                  {skill?.name ?? t("page.skillFallback")}
                </Button>
              }
              items={(skills ?? []).map((sk) => ({
                label: sk.name,
                icon: "Sparkles" as const,
                onClick: () => router.push(`/eval/skills/${sk.id}?range=${range}`),
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
            <Button
              kind="primary"
              icon="Play"
              onClick={() => activity.start()}
              disabled={!!activity.disabledReason || !skill}
              title={blockText}
              aria-describedby={blockText ? "run-eval-reason" : undefined}
            >
              {runLabel}
            </Button>
            {blockText && (
              <span id="run-eval-reason" style={s.srOnly}>
                {blockText}
              </span>
            )}
          </div>
        </div>

        {activity.startError && (
          <div role="alert" style={s.error}>
            {ts("evals.startFailed", { message: activity.startError })}
          </div>
        )}

        {runs.isLoading && <Skeleton height={260} />}
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
