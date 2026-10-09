"use client";

import React from "react";
import { deltaColor, formatPointDelta, toPointDelta } from "@/lib/eval";

/** Signed point delta ("▲ 4pt" green / "▼ 2pt" red). Renders nothing when the
 *  delta is null (no previous run / null metric). `invert` flips the colours
 *  (not used for the three metrics — only cost cards invert, see CompareRunsModal). */
export function MetricDelta({
  delta,
  invert = false,
  style,
}: {
  /** Fractional delta (0.04 = 4 points). */
  delta: number | null | undefined;
  invert?: boolean;
  style?: React.CSSProperties;
}) {
  const d = toPointDelta(delta);
  if (!d) return null;
  return (
    <span
      className="tnum"
      style={{ fontSize: 13, fontWeight: 600, color: deltaColor(d.direction, invert), whiteSpace: "nowrap", ...style }}
    >
      {formatPointDelta(d)}
    </span>
  );
}
