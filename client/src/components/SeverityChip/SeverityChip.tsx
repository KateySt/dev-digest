import React from "react";
import type { Severity } from "@devdigest/shared";
import { Icon } from "@/components/icon";
import { SEVERITY_STYLE } from "@/components/severity";
import { cn } from "@/lib/utils";

const TOTAL_SLOTS = 12;

/** Always 12 slots: first `count` slots merge into a solid segment,
 *  remaining (12 - count) render as faded separate dots. Slots are 1px with
 *  a 1px gap; the solid segment fills its gaps with the same colour. */
function SeverityDots({ count, fill }: { count: number; fill: string }) {
  const filled = Math.min(count, TOTAL_SLOTS);
  const empty = TOTAL_SLOTS - filled;

  return (
    <div className="flex items-center gap-px">
      {filled > 0 && (
        <div data-slot="filled" className={cn("flex h-px shrink-0 gap-px rounded-[0.5px]", fill)}>
          {Array.from({ length: filled }).map((_, i) => (
            <span key={i} className="w-px" />
          ))}
        </div>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <div key={i} data-slot="empty" className={cn("size-px shrink-0 opacity-20", fill)} />
      ))}
    </div>
  );
}

export function SeverityChip({ sev, count }: { sev: Severity; count: number }) {
  if (count <= 0) return null;

  const meta = SEVERITY_STYLE[sev];
  const SIcon = Icon[meta.icon];

  return (
    <div className="flex min-w-7 flex-col items-stretch gap-1">
      <span className={cn("inline-flex items-center gap-0.75 text-[11.5px] font-semibold", meta.text)}>
        <SIcon size={12} className="shrink-0" aria-hidden />
        <span className="tnum">{count}</span>
      </span>
      <SeverityDots count={count} fill={meta.fill} />
    </div>
  );
}
