"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { METRIC_TONE, MetricTrendChart, type TrendPoint } from "@/components/eval-metrics";
import { METRICS, type MetricKey } from "@/lib/eval";
import { cn } from "@/lib/utils";
import { SECTION_LABEL } from "../constants";

/** The "Metric trend" panel: title, colour legend and the three-series chart
 *  (the points follow the page's range filter — the caller decides which). */
export function TrendPanel({ points }: { points: TrendPoint[] }) {
  const t = useTranslations("evalMetrics");
  return (
    <div className="mb-5.5 min-w-0 rounded-xl border border-border bg-elevated px-5 py-4.5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={SECTION_LABEL}>
          <Icon.TrendingUp size={14} aria-hidden />
          {t("trend.title")}
        </span>
        <div className="ml-auto flex gap-4">
          {METRICS.map((m) => (
            <span key={m.key} className="inline-flex items-center gap-1.5 text-ui text-muted-foreground">
              <span className={cn("h-0.5 w-3", METRIC_TONE[m.key].bg)} />
              {t(
                `trend.${m.key === "citation_accuracy" ? "citation" : (m.key as Exclude<MetricKey, "citation_accuracy">)}`,
              )}
            </span>
          ))}
        </div>
      </div>
      <MetricTrendChart points={points} />
    </div>
  );
}
