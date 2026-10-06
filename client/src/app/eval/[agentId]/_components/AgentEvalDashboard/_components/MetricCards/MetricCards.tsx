"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { MetricDelta, MetricValue } from "@/components/eval-metrics";
import { METRICS } from "@/lib/eval";
import { s } from "../../styles";

/** Recall / Precision / Citation cards: latest finished run's value, point
 *  delta vs. the previous finished run, and a sparkline of the finished-run
 *  history. Independent of the range filter (history is all-time). */
export function MetricCards({ history }: { history: EvalSuiteRun[] }) {
  const t = useTranslations("evalAgent");
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];

  return (
    <div style={s.cards}>
      {METRICS.map((m) => {
        const value = latest?.[m.key] ?? null;
        const prev = previous?.[m.key] ?? null;
        const trend = history.map((r) => r[m.key]).filter((v): v is number => v != null);
        return (
          <div key={m.key} style={s.card}>
            <div style={s.cardTop}>
              <span style={s.cardLabel}>{t(`cards.${m.key}`)}</span>
              {trend.length > 0 && <Sparkline data={trend} color={m.color} w={72} h={24} />}
            </div>
            <div style={s.cardValueRow}>
              <MetricValue value={value} color={m.color} size={34} />
              {value != null && prev != null && <MetricDelta delta={value - prev} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
