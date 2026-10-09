"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SkillEvalSuiteRun } from "@devdigest/shared";
import { MetricTrendChart } from "@/components/eval-metrics";
import { s } from "../../styles";

/** Number of finished runs the mini trend shows (no range filter). */
export const MINI_TREND_RUNS = 10;

/** Compact three-series trend of the skill's last finished suite runs (a single
 *  run renders as dots). The whole chart links to the per-skill dashboard. */
export function MiniTrend({ skillId, history }: { skillId: string; history: readonly SkillEvalSuiteRun[] }) {
  const t = useTranslations("skills");
  const recent = history.slice(-MINI_TREND_RUNS);
  if (recent.length === 0) return <div style={s.trendEmpty}>{t("evals.trend.empty")}</div>;
  return (
    <Link href={`/eval/skills/${skillId}`} aria-label={t("evals.trend.open")} title={t("evals.trend.open")} style={s.trend}>
      <div style={s.trendTitle}>{t("evals.trend.title", { count: recent.length })}</div>
      <MetricTrendChart points={recent} height={90} />
    </Link>
  );
}
