"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SkillEvalSuiteRun } from "@devdigest/shared";
import { MetricTrendChart } from "@/components/eval-metrics";

/** Number of finished runs the mini trend shows (no range filter). */
export const MINI_TREND_RUNS = 10;

/** Compact three-series trend of the skill's last finished suite runs (a single
 *  run renders as dots). The whole chart links to the per-skill dashboard. */
export function MiniTrend({ skillId, history }: { skillId: string; history: readonly SkillEvalSuiteRun[] }) {
  const t = useTranslations("skills");
  const recent = history.slice(-MINI_TREND_RUNS);
  if (recent.length === 0) return <div className="mt-3.5 text-ui text-subtle-foreground">{t("evals.trend.empty")}</div>;
  return (
    <Link href={`/eval/skills/${skillId}`} aria-label={t("evals.trend.open")} title={t("evals.trend.open")}
      className="mt-3.5 block min-w-0 overflow-hidden rounded-[9px] border border-border bg-elevated px-3.5 py-2.5 text-[inherit] no-underline"
    >
      <div className="mb-1.5 text-xs font-semibold text-subtle-foreground">{t("evals.trend.title", { count: recent.length })}</div>
      <MetricTrendChart points={recent} height={90} />
    </Link>
  );
}
