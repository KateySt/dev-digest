"use client";

import { formatPercent, type MetricKey } from "@/lib/eval";
import { cn } from "@/lib/utils";
import { METRIC_TONE } from "./tones";

/** Sizes in use (px → value class, "%" class at ~0.55×). */
const SIZE = {
  18: { value: "text-xl", unit: "text-[10px]" },
  22: { value: "text-3xl", unit: "text-xs" },
  26: { value: "text-5xl", unit: "text-base" },
  34: { value: "text-[34px]", unit: "text-[19px]" },
} as const;

/** A metric's headline number: large value in the metric colour with a
 *  smaller muted "%". Null renders "—" with no "%". */
export function MetricValue({
  value,
  metric,
  size = 22,
}: {
  value: number | null | undefined;
  metric: MetricKey;
  size?: keyof typeof SIZE;
}) {
  const known = value != null;
  return (
    <span
      data-metric={metric}
      className={cn(
        "tnum font-bold tracking-[-0.02em]",
        SIZE[size].value,
        known ? METRIC_TONE[metric].text : "text-subtle-foreground",
      )}
    >
      {formatPercent(value)}
      {known && <span className={cn("font-semibold text-subtle-foreground", SIZE[size].unit)}>%</span>}
    </span>
  );
}
