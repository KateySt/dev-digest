"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { MetricDelta, MetricValue, deltaTone } from "@/components/eval-metrics";
import { formatRunCost } from "@/components/run-cost-badge";
import { METRICS, formatPercent, type MetricKey } from "@/lib/eval";
import { cn } from "@/lib/utils";

type RunMetrics = Record<MetricKey, number | null> & { cost_usd: number | null };

const CARD = "min-w-0 rounded-[9px] border border-border bg-surface px-4 py-3.5";
const CARD_LABEL = "mb-2.5 text-2xs font-bold tracking-[0.05em] text-subtle-foreground";
const CARD_ROW = "flex flex-wrap items-baseline gap-2";
const OLD_VALUE = "tnum text-lg text-subtle-foreground";

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
    <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-3.5">
      {METRICS.map((m) => (
        <div key={m.key} className={CARD}>
          <div className={CARD_LABEL}>{t(`metrics.${m.key}`).toUpperCase()}</div>
          <div className={CARD_ROW}>
            <span className={OLD_VALUE}>{formatPercent(oldRun[m.key])}%</span>
            <Icon.ArrowRight size={13} className="text-subtle-foreground" aria-hidden />
            <MetricValue value={newRun[m.key]} metric={m.key} size={26} />
            <MetricDelta delta={deltas[m.key]} />
          </div>
        </div>
      ))}
      <div className={CARD}>
        <div className={CARD_LABEL}>{t("compare.cost")}</div>
        <div className={CARD_ROW}>
          <span className={OLD_VALUE}>{oldRun.cost_usd != null ? formatRunCost(oldRun.cost_usd) : "—"}</span>
          <Icon.ArrowRight size={13} className="text-subtle-foreground" aria-hidden />
          <span className="tnum text-5xl font-bold text-foreground">
            {newRun.cost_usd != null ? formatRunCost(newRun.cost_usd) : "—"}
          </span>
          {cost != null && costDir !== "flat" && (
            // Cost is inverted: a rise is red, a drop green.
            <span data-direction={costDir} className={cn("tnum text-sm font-semibold", deltaTone(costDir, true))}>
              {costDir === "up" ? "▲ " : "▼ "}${Math.abs(cost).toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
