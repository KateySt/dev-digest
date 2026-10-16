"use client";

import React from "react";
import { formatPointDelta, toPointDelta } from "@/lib/eval";
import { cn } from "@/lib/utils";
import { deltaTone } from "./tones";

/** Signed point delta ("▲ 4pt" green / "▼ 2pt" red). Renders nothing when the
 *  delta is null (no previous run / null metric). `invert` flips the colours
 *  (not used for the three metrics — only cost cards invert, see CompareMetricCards). */
export function MetricDelta({
  delta,
  invert = false,
  className,
}: {
  /** Fractional delta (0.04 = 4 points). */
  delta: number | null | undefined;
  invert?: boolean;
  className?: string;
}) {
  const d = toPointDelta(delta);
  if (!d) return null;
  return (
    <span
      data-direction={d.direction}
      className={cn("tnum text-sm font-semibold whitespace-nowrap", deltaTone(d.direction, invert), className)}
    >
      {formatPointDelta(d)}
    </span>
  );
}
