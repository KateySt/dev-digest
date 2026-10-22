/* Donut — ring chart with a legend, on Recharts. */
import type React from "react";
import { PieChart, Pie, Cell } from "recharts";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  segments,
  size = 130,
  stroke = 22,
  valuePrefix = "$",
  valueFormat,
}: {
  segments: DonutSegment[];
  size?: number;
  stroke?: number;
  valuePrefix?: string;
  /** Overrides the default `{valuePrefix}{value.toFixed(2)}` legend format —
   *  e.g. an integer count chart has no `$` and no decimals. */
  valueFormat?: (value: number) => string;
}) {
  return (
    <div className="flex items-center gap-5">
      <PieChart width={size} height={size}>
        <Pie
          data={segments}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={(size - stroke) / 2 - stroke / 2}
          outerRadius={(size - stroke) / 2 + stroke / 2}
          startAngle={90}
          endAngle={-270}
          isAnimationActive={false}
          stroke="none"
        >
          {segments.map((s, i) => (
            <Cell key={i} fill={s.color} />
          ))}
        </Pie>
      </PieChart>
      <div className="flex flex-col gap-2">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm">
            {/* Segment colour is data: passed as --c. */}
            <span
              aria-hidden
              className="size-[9px] rounded-[2px] bg-(--c)"
              style={{ "--c": s.color } as React.CSSProperties}
            />
            <span className="flex-1 text-muted-foreground">{s.label}</span>
            <span className="mono tnum font-semibold text-foreground">
              {valueFormat ? valueFormat(s.value) : `${valuePrefix}${s.value.toFixed(2)}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
