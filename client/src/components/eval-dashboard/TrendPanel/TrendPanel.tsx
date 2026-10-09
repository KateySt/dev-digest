"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { MetricTrendChart, type TrendPoint } from "@/components/eval-metrics";
import { METRICS, type MetricKey } from "@/lib/eval";
import { s } from "../styles";

/** The "Metric trend" panel: title, colour legend and the three-series chart
 *  (the points follow the page's range filter — the caller decides which). */
export function TrendPanel({ points }: { points: TrendPoint[] }) {
  const t = useTranslations("evalMetrics");
  return (
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
      <MetricTrendChart points={points} />
    </div>
  );
}
