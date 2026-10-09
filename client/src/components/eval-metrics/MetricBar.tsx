"use client";

import React from "react";
import { formatPercent } from "@/lib/eval";

/** Table cell: a thin metric-coloured bar plus the percentage ("—" when null). */
export function MetricBar({
  value,
  color,
  barWidth = 96,
}: {
  value: number | null | undefined;
  color: string;
  barWidth?: number;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div style={{ width: barWidth, height: 6, background: "var(--bg-hover)", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span className="mono tnum" style={{ fontSize: 12.5, color: "var(--text-secondary)", minWidth: 34, textAlign: "right" }}>
        {value == null ? "—" : `${formatPercent(value)}%`}
      </span>
    </div>
  );
}
