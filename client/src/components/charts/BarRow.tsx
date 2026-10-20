/* BarRow — single labelled horizontal bar. The fill width and colour are data,
   passed as the `--w` / `--c` CSS variables. */
import type React from "react";

export function BarRow({
  label,
  value,
  max,
  color = "var(--accent)",
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  /** Fill colour (any CSS colour, e.g. `var(--crit)`). */
  color?: string;
  suffix?: string;
}) {
  return (
    <div className="grid grid-cols-[150px_1fr_70px] items-center gap-3.5 py-1.5">
      <span className="mono truncate text-sm text-muted-foreground">{label}</span>
      <div className="h-2.5 overflow-hidden rounded-[3px] bg-muted">
        <div
          data-testid="bar-fill"
          className="h-full w-(--w) rounded-[3px] bg-(--c)"
          style={{ "--w": `${(value / max) * 100}%`, "--c": color } as React.CSSProperties}
        />
      </div>
      <span className="mono tnum text-right text-sm font-semibold">{suffix || ""}</span>
    </div>
  );
}
