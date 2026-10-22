/* MetricCard — KPI tile: big value, signed delta, and an optional Sparkline. */
import type React from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";

export function MetricCard({
  label,
  value,
  delta,
  color,
  trend,
  suffix,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number;
  /** Sparkline stroke colour (any CSS colour, e.g. `var(--ok)`). */
  color?: string;
  trend?: number[];
  suffix?: string;
}) {
  const up = (delta ?? 0) > 0;
  const flat = delta === 0;
  const deltaClass = flat ? "text-subtle-foreground" : up ? "text-ok" : "text-crit";
  const DeltaIcon = flat ? Icon.Slash : up ? Icon.ArrowUp : Icon.ArrowDown;
  return (
    <div className="flex-1 rounded-[9px] border border-border bg-elevated p-4.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-[0.03em] text-subtle-foreground">{label}</span>
        {trend && <Sparkline data={trend} color={color || "var(--accent)"} w={56} h={20} />}
      </div>
      <div className="mt-3 flex items-baseline gap-2.5">
        <span className="tnum text-6xl font-bold tracking-[-0.02em]">
          {value}
          {suffix && <span className="text-xl text-subtle-foreground">{suffix}</span>}
        </span>
        {delta != null && (
          <span className={cn("inline-flex items-center gap-0.5 text-sm font-semibold", deltaClass)}>
            <DeltaIcon size={12} aria-hidden />
            <span className="tnum">{Math.abs(delta).toFixed(2)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
