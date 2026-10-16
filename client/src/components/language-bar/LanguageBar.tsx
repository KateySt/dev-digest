import React from "react";
import { languageStats } from "./helpers";

/** GitHub-style stacked language bar, optionally with a percentage legend below
 *  it. Segment widths/colours are data, passed as `--w`/`--c` CSS variables. */
export function LanguageBar({
  languages,
  height = 6,
  showLegend = false,
  maxLegendItems = 5,
}: {
  languages: Record<string, number> | null | undefined;
  height?: number;
  showLegend?: boolean;
  maxLegendItems?: number;
}) {
  const stats = languageStats(languages);
  if (stats.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div
        title={stats.map((s) => `${s.name} ${s.pct.toFixed(1)}%`).join(" · ")}
        className="flex h-(--bar-h) w-full overflow-hidden rounded-full bg-muted"
        style={{ "--bar-h": `${height}px` } as React.CSSProperties}
      >
        {stats.map((s) => (
          <div
            key={s.name}
            data-testid="language-segment"
            className="w-(--w) bg-(--c)"
            style={{ "--w": `${s.pct}%`, "--c": s.color } as React.CSSProperties}
          />
        ))}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-2.5 text-xs text-muted-foreground">
          {stats.slice(0, maxLegendItems).map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.25">
              <span
                className="inline-block size-2 shrink-0 rounded-full bg-(--c)"
                style={{ "--c": s.color } as React.CSSProperties}
              />
              {s.name} <span className="mono tnum">{s.pct.toFixed(1)}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
