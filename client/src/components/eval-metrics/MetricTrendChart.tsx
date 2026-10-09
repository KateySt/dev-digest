"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LineChart } from "@devdigest/ui";
import { METRICS, type MetricKey } from "@/lib/eval";

export type TrendPoint = Record<MetricKey, number | null>;

const Y_MIN = 0.6;
const Y_MAX = 1.0;
const TICKS = [1.0, 0.9, 0.8, 0.7, 0.6];

/** Three-series metric trend (y 0.6–1.0). A single point renders as dots —
 *  Recharts draws nothing for one point with `dot={false}`. */
export function MetricTrendChart({ points, height = 220 }: { points: TrendPoint[]; height?: number }) {
  const t = useTranslations("evalMetrics");

  if (points.length <= 1) {
    const w = 620;
    const h = height;
    const padL = 38;
    const y = (v: number) => 14 + (1 - (Math.min(Y_MAX, Math.max(Y_MIN, v)) - Y_MIN) / (Y_MAX - Y_MIN)) * (h - 14 - 22);
    return (
      <svg role="img" aria-label={t("trend.ariaLabel")} viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w, height, display: "block" }}>
        {TICKS.map((tick) => (
          <g key={tick}>
            <line x1={padL} x2={w - 14} y1={y(tick)} y2={y(tick)} stroke="var(--border)" />
            <text x={0} y={y(tick) + 4} fontSize={12} fill="var(--text-muted)">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        {points[0] &&
          METRICS.map((m) => {
            const v = points[0]![m.key];
            return v == null ? null : <circle key={m.key} cx={(padL + w - 14) / 2} cy={y(v)} r={4} fill={m.color} />;
          })}
      </svg>
    );
  }

  return (
    <LineChart
      h={height}
      w={1600}
      yMin={Y_MIN}
      yMax={Y_MAX}
      series={METRICS.map((m) => ({ name: m.key, color: m.color, data: points.map((p) => p[m.key] ?? 0) }))}
    />
  );
}
