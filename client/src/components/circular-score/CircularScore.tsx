import React from "react";
import { cn } from "@/lib/utils";

/** Ring gauge for a 0–100 score (≥75 ok, ≥50 warn, else crit). `size` is a
 *  runtime prop, so it reaches CSS as the `--score-size` variable. */
export function CircularScore({
  score,
  size = 44,
  stroke = 4,
}: {
  score: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const ring = score >= 75 ? "stroke-ok" : score >= 50 ? "stroke-warn" : "stroke-crit";
  return (
    <div
      className="relative size-(--score-size) shrink-0"
      style={{ "--score-size": `${size}px` } as React.CSSProperties}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          data-testid="score-ring"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - score / 100)}
          strokeLinecap="round"
          className={cn("transition-[stroke-dashoffset] duration-600 ease-in-out", ring)}
        />
      </svg>
      <div className="tnum absolute inset-0 grid place-items-center text-[calc(var(--score-size)*0.3)] font-bold">
        {score}
      </div>
    </div>
  );
}
