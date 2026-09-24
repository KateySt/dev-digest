/* BlastTree — expandable row per changed symbol → its callers as file:line
   MonoLinks (wired to onNavigateToFile) plus endpoint/cron chips for that
   symbol, following RiskAreasList.tsx's card+detail-panel pattern. Caller
   refs are structured `{file, line}` fields off `BlastCaller` (not
   "path:12-18" strings), so `parseFileRef` is NOT used here — that helper is
   only for `Risk.file_refs`. A symbol with zero callers renders as a static,
   non-expandable row (nothing to expand into, by construction of
   `toBlastRadius` — see server/src/modules/blast/helpers.ts). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { BlastRadius } from "@devdigest/shared";
import { s } from "./styles";

export function BlastTree({
  radius,
  onNavigateToFile,
}: {
  radius: BlastRadius;
  onNavigateToFile: (path: string, line: number) => void;
}) {
  const t = useTranslations("blast");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const impactBySymbol = new Map(radius.downstream.map((d) => [d.symbol, d]));

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div style={s.wrap}>
      {radius.changed_symbols.map((symbol, i) => {
        const key = `${symbol.file}:${symbol.name}:${i}`;
        const impact = impactBySymbol.get(symbol.name);
        const callers = impact?.callers ?? [];
        const hasCallers = callers.length > 0;
        const isOpen = hasCallers && expanded.has(key);

        return (
          <div key={key}>
            <div
              role={hasCallers ? "button" : undefined}
              tabIndex={hasCallers ? 0 : undefined}
              onClick={hasCallers ? () => toggle(key) : undefined}
              onKeyDown={
                hasCallers
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") toggle(key);
                    }
                  : undefined
              }
              style={s.symbolRow(hasCallers)}
            >
              {hasCallers && <Icon.ChevronDown size={14} style={s.chevron(isOpen)} />}
              <span style={s.symbolName}>{symbol.name}</span>
              <span className="mono" style={s.symbolFile}>
                {symbol.file}
              </span>
              <Badge>{t("callerCount", { count: callers.length })}</Badge>
            </div>

            {isOpen && (
              <div style={s.detail}>
                <div style={s.callerList}>
                  {callers.map((caller, ci) => (
                    <MonoLink
                      key={ci}
                      onClick={() => onNavigateToFile(caller.file, caller.line)}
                    >
                      {caller.file}:{caller.line} — {caller.name}
                    </MonoLink>
                  ))}
                </div>

                {((impact?.endpoints_affected.length ?? 0) > 0 ||
                  (impact?.crons_affected.length ?? 0) > 0) && (
                  <div style={s.chipRow}>
                    {impact?.endpoints_affected.map((ep) => (
                      <Badge key={ep} icon="Globe">
                        {ep}
                      </Badge>
                    ))}
                    {impact?.crons_affected.map((cron) => (
                      <Badge key={cron} icon="Clock">
                        {cron}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
