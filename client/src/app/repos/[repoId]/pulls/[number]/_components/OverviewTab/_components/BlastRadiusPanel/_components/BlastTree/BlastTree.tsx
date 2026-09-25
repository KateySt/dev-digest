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
              {/* Fixed-width slot reserves the chevron's horizontal space even
                 on rows with no callers, so the code icon/name/file columns
                 stay aligned across rows regardless of whether a chevron
                 renders. */}
              <span style={s.chevronSlot}>
                {hasCallers && <Icon.ChevronDown size={14} style={s.chevron(isOpen)} />}
              </span>
              <Icon.Code size={13} aria-hidden style={s.codeIcon} />
              <span style={s.symbolName}>
                {symbol.name}
                {(symbol.kind === "function" || symbol.kind === "method") && "()"}
              </span>
              <span className="mono" style={s.symbolFile}>
                {symbol.file}
              </span>
              <span style={s.callerCount}>{t("callerCount", { count: callers.length })}</span>
            </div>

            {isOpen && (
              <div style={s.detail}>
                <div style={s.callerList}>
                  {callers.map((caller, ci) => (
                    <div key={ci} style={s.callerItem}>
                      <Icon.CornerDownRight size={12} aria-hidden style={s.callerConnector} />
                      <MonoLink onClick={() => onNavigateToFile(caller.file, caller.line)}>
                        {caller.file}:{caller.line} — {caller.name}
                      </MonoLink>
                    </div>
                  ))}
                </div>

                {((impact?.endpoints_affected.length ?? 0) > 0 ||
                  (impact?.crons_affected.length ?? 0) > 0) && (
                  <div style={s.chipRow}>
                    {/* Outline styling (transparent bg, colored border/text)
                       differentiates endpoint (blue) from cron (orange) chips
                       — both used the same uniform gray Badge fill before.
                       Badge's own `style` prop also overrides its hardcoded
                       `white-space: nowrap`, which otherwise runs a long
                       endpoint path/cron name past the chip's edge instead of
                       wrapping (see client/INSIGHTS.md's unbreakable
                       file:line entry — same fix). */}
                    {impact?.endpoints_affected.map((ep) => (
                      <Badge
                        key={ep}
                        icon="Globe"
                        color="var(--accent-text)"
                        bg="var(--accent-bg)"
                        style={s.endpointBadge}
                      >
                        {ep}
                      </Badge>
                    ))}
                    {impact?.crons_affected.map((cron) => (
                      <Badge key={cron} icon="Clock" color="var(--warn)" bg="var(--warn-bg)" style={s.cronBadge}>
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
