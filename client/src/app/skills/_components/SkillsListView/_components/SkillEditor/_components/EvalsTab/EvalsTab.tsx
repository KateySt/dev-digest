"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useEvalCases, useEvalStats } from "@/lib/hooks/eval-cases";
import { useSkillEvalRuns, type SkillEvalActivity } from "@/lib/hooks/eval-runs";
import { EvalCaseList, MetricTiles, type RunAllControl } from "@/components/eval-cases";
import { DraftResults } from "./_components/DraftResults";
import { MiniTrend } from "./_components/MiniTrend";
import { s } from "./styles";

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
    <div style={s.wrap}>
      <div>
        <div style={s.metricsHeader}>
          <span style={s.metricsLabel}>
            <Icon.Gauge size={14} />
            {t("evalsTab.metricsLabel")}
          </span>
          <Link href={`/eval/skills/${skill.id}`} className="mono" style={s.dashLink}>
            {t("evalsTab.viewDashboard")}
          </Link>
        </div>
        <MetricTiles stats={stats} />
        <MiniTrend skillId={skill.id} history={runs.data?.history ?? []} />
      </div>

      {activity.startError && (
        <div role="alert" style={s.error}>
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
