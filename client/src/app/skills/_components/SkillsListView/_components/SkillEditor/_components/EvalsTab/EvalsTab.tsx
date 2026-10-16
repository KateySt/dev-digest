"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import type { Skill } from "@devdigest/shared";
import { useEvalCases, useEvalStats } from "@/lib/hooks/eval-cases";
import { useSkillEvalRuns, type SkillEvalActivity } from "@/lib/hooks/eval-runs";
import { EvalCaseList, MetricTiles, type RunAllControl } from "@/components/eval-cases";
import { DraftResults } from "./_components/DraftResults";
import { MiniTrend } from "./_components/MiniTrend";

/** Skill Editor's Evals tab: metric tiles + mini trend (latest REAL suite run),
 *  the Draft results block (unsaved-text run, kept apart from the real numbers),
 *  then the shared case list. Run state comes from the editor's single
 *  `useSkillEvalActivity` so the header's "Run on evals" and this tab agree. */
export function EvalsTab({
  skill,
  activity,
  runBlockText,
}: {
  skill: Skill;
  activity: SkillEvalActivity;
  /** Translated reason runs are disabled (undefined when allowed). */
  runBlockText: string | undefined;
}) {
  const t = useTranslations("eval");
  const ts = useTranslations("skills");
  const { data: stats } = useEvalStats("skill", skill.id);
  const { data: cases } = useEvalCases("skill", skill.id);
  const runs = useSkillEvalRuns(skill.id, "all");

  const runAll: RunAllControl = {
    label: activity.progress
      ? t("evalsTab.runningProgress", { done: activity.progress.done, total: activity.progress.total })
      : t("evalsTab.runAllCount", { count: activity.caseCount }),
    disabled: !!activity.disabledReason,
    disabledReason: runBlockText,
    onClick: () => activity.start(),
  };

  return (
    <div className="flex max-w-[900px] min-w-0 flex-col gap-6">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex items-center gap-2 text-xs font-bold tracking-[0.06em] text-subtle-foreground uppercase">
            <Icon.Gauge size={14} aria-hidden />
            {t("evalsTab.metricsLabel")}
          </span>
          <Link href={`/eval/skills/${skill.id}`} className="mono ml-auto text-ui text-muted-foreground no-underline">
            {t("evalsTab.viewDashboard")}
          </Link>
        </div>
        <MetricTiles stats={stats} />
        <MiniTrend skillId={skill.id} history={runs.data?.history ?? []} />
      </div>

      {activity.startError && (
        <div role="alert" className="min-w-0 rounded-lg border border-crit px-3 py-2 text-sm text-crit wrap-anywhere break-words">
          {ts("evals.startFailed", { message: activity.startError })}
        </div>
      )}

      {activity.draft && <DraftResults draft={activity.draft} cases={cases ?? []} />}

      <EvalCaseList
        ownerKind="skill"
        ownerId={skill.id}
        ownerName={skill.name}
        runAll={runAll}
        rowRunDisabledReason={runBlockText}
      />
    </div>
  );
}
