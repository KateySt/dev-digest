"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Sparkline } from "@/components/charts";
import { MetricDelta, MetricValue } from "@/components/eval-metrics";
import { METRICS, type MetricKey } from "@/lib/eval";

/** Recall / Precision / Citation cards: latest finished run's value, point
 *  delta vs. the previous finished run, and a sparkline of the finished-run
 *  history. Independent of the range filter (history is all-time). Works for
 *  any run list — only the three metric fields are read. */
export function MetricCards({ history }: { history: ReadonlyArray<Record<MetricKey, number | null>> }) {
  const t = useTranslations("evalMetrics");
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];

  return (
    <div className="mb-4.5 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-4">
      {METRICS.map((m) => {
        const value = latest?.[m.key] ?? null;
        const prev = previous?.[m.key] ?? null;
        const trend = history.map((r) => r[m.key]).filter((v): v is number => v != null);
        return (
          <div key={m.key} className="min-w-0 rounded-xl border border-border bg-elevated px-5 py-4.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-bold tracking-[0.05em] text-subtle-foreground">{t(`cards.${m.key}`)}</span>
              {trend.length > 0 && <Sparkline data={trend} color={m.color} w={72} h={24} />}
            </div>
            <div className="mt-3 flex items-baseline gap-2.5">
              <MetricValue value={value} metric={m.key} size={34} />
              {value != null && prev != null && <MetricDelta delta={value - prev} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
