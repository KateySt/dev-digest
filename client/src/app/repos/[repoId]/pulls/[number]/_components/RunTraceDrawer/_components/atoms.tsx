/* atoms — trivial presentational layout helpers shared by the trace body
   (Stat tile, labelled Row). Grouped in one file: no logic, never tested alone. */
import type React from "react";

export function Stat({ label, val }: { label: string; val: React.ReactNode }) {
  return (
    <div className="flex-1 rounded-[7px] border border-border bg-surface px-3 py-2.5">
      <div className="text-xs font-semibold text-subtle-foreground">{label}</div>
      <div className="tnum mt-1 text-lg font-bold">
        {val}
      </div>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-27.5 shrink-0 text-subtle-foreground">{label}</span>
      {children}
    </div>
  );
}
