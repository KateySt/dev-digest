"use client";

import React from "react";
import { formatPercent } from "@/lib/eval";

/** A metric's headline number: large value in the metric colour with a
 *  smaller muted "%". Null renders "—" with no "%". */
export function MetricValue({
  value,
  color,
  size = 22,
}: {
  value: number | null | undefined;
  color: string;
  size?: number;
}) {
  const known = value != null;
  return (
    <span className="tnum" style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.02em", color: known ? color : "var(--text-muted)" }}>
      {formatPercent(value)}
      {known && <span style={{ fontSize: Math.round(size * 0.55), color: "var(--text-muted)", fontWeight: 600 }}>%</span>}
    </span>
  );
}
