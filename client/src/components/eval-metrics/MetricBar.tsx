"use client";

import type React from "react";
import { formatPercent, type MetricKey } from "@/lib/eval";
import { cn } from "@/lib/utils";
import { METRIC_TONE } from "./tones";

/** Track widths in use (px → class). */
const BAR_WIDTH = { 64: "w-16", 72: "w-18", 96: "w-24" } as const;

/** Table cell: a thin metric-coloured bar plus the percentage ("—" when null). */
export function MetricBar({
  value,
  metric,
  barWidth = 96,
}: {
  value: number | null | undefined;
  metric: MetricKey;
  barWidth?: keyof typeof BAR_WIDTH;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className={cn("h-1.5 shrink-0 overflow-hidden rounded-xs bg-muted", BAR_WIDTH[barWidth])}>
        <div
          data-testid="metric-bar-fill"
          data-metric={metric}
          // Runtime fill width (the metric value).
          style={{ "--w": `${pct}%` } as React.CSSProperties}
          className={cn("h-full w-(--w) rounded-xs", METRIC_TONE[metric].bg)}
        />
      </div>
      <span className="mono tnum min-w-[34px] text-right text-ui text-muted-foreground">
        {value == null ? "—" : `${formatPercent(value)}%`}
      </span>
    </div>
  );
}
