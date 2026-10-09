"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { MetricDelta, MetricValue } from "@/components/eval-metrics";
import { formatRunCost } from "@/components/run-cost-badge";
import { METRICS, deltaColor, formatPercent, type MetricKey } from "@/lib/eval";
import { s } from "../../styles";

type RunMetrics = Record<MetricKey, number | null> & { cost_usd: number | null };

/** Recall / Precision / Citation / Cost cards, old → new with ▲/▼ deltas
 *  (drop red, rise green; cost is inverted — a rise is red). Reads only the
 *  metric fields, so it serves agent and skill compares alike. */
export function CompareMetricCards({
  oldRun,
  newRun,
  deltas,
}: {
  oldRun: RunMetrics;
  newRun: RunMetrics;
  deltas: Record<MetricKey | "cost_usd", number | null>;
}) {
  const t = useTranslations("evalMetrics");
  const cost = deltas.cost_usd;
  const costDir = cost == null ? "flat" : cost > 0 ? "up" : cost < 0 ? "down" : "flat";

  return (
    <div style={s.compareCards}>
      {METRICS.map((m) => (
        <div key={m.key} style={s.compareCard}>
          <div style={s.compareCardLabel}>{t(`metrics.${m.key}`).toUpperCase()}</div>
          <div style={s.compareCardRow}>
            <span className="tnum" style={s.oldValue}>
              {formatPercent(oldRun[m.key])}%
            </span>
            <Icon.ArrowRight size={13} style={s.arrow} />
            <MetricValue value={newRun[m.key]} color={m.color} size={26} />
            <MetricDelta delta={deltas[m.key]} />
          </div>
        </div>
      ))}
      <div style={s.compareCard}>
        <div style={s.compareCardLabel}>{t("compare.cost")}</div>
        <div style={s.compareCardRow}>
          <span className="tnum" style={s.oldValue}>
            {oldRun.cost_usd != null ? formatRunCost(oldRun.cost_usd) : "—"}
          </span>
          <Icon.ArrowRight size={13} style={s.arrow} />
          <span className="tnum" style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>
            {newRun.cost_usd != null ? formatRunCost(newRun.cost_usd) : "—"}
          </span>
          {cost != null && costDir !== "flat" && (
            // Cost is inverted: a rise is red, a drop green.
            <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: deltaColor(costDir, true) }}>
              {costDir === "up" ? "▲ " : "▼ "}
              ${Math.abs(cost).toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
