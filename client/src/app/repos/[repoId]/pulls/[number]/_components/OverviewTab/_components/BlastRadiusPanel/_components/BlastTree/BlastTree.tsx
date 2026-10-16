/* BlastTree — one collapsible group per changed symbol: a header row
   (chevron, code icon, `name()` in mono, "N callers" right-aligned) that
   expands into a guide-lined list of caller `file:line` MonoLinks (wired to
   onNavigateToFile), followed by the endpoint (blue) and cron (amber) chips
   that symbol reaches. Caller refs are structured `{file, line}` fields off
   `BlastCaller` (not "path:12-18" strings), so `parseFileRef` is NOT used
   here — that helper is only for `Risk.file_refs`. A symbol with zero callers
   renders as a static, non-expandable row (nothing to expand into, by
   construction of `toBlastRadius` — see server/src/modules/blast/helpers.ts).
   The first expandable symbol starts open, the rest collapsed. */
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
  const impactBySymbol = new Map(radius.downstream.map((d) => [d.symbol, d]));
  const keyOf = (i: number) => `${radius.changed_symbols[i]?.file}:${radius.changed_symbols[i]?.name}:${i}`;

  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const first = radius.changed_symbols.findIndex(
      (sym) => (impactBySymbol.get(sym.name)?.callers.length ?? 0) > 0,
    );
    return new Set(first >= 0 ? [keyOf(first)] : []);
  });

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
        const key = keyOf(i);
        const impact = impactBySymbol.get(symbol.name);
        const callers = impact?.callers ?? [];
        const endpoints = impact?.endpoints_affected ?? [];
        const crons = impact?.crons_affected ?? [];
        const hasCallers = callers.length > 0;
        const isOpen = hasCallers && expanded.has(key);
        const hasChips = endpoints.length > 0 || crons.length > 0;

        return (
          <div key={key}>
            <div
              role={hasCallers ? "button" : undefined}
              tabIndex={hasCallers ? 0 : undefined}
              aria-expanded={hasCallers ? isOpen : undefined}
              title={symbol.file}
              onClick={hasCallers ? () => toggle(key) : undefined}
              onKeyDown={
                hasCallers
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(key);
                      }
                    }
                  : undefined
              }
              style={s.symbolRow(hasCallers, isOpen)}
            >
              {/* Fixed-width slot reserves the chevron's space even on rows
                 with no callers, so names stay aligned across rows. */}
              <span style={s.chevronSlot}>
                {hasCallers && <Icon.ChevronRight size={13} aria-hidden style={s.chevron(isOpen)} />}
              </span>
              <Icon.Code size={13} aria-hidden style={s.codeIcon} />
              <span className="mono" style={s.symbolName}>
                {symbol.name}
                {(symbol.kind === "function" || symbol.kind === "method") && "()"}
              </span>
              <span style={s.callerCount}>{t("callerCount", { count: callers.length })}</span>
            </div>

            {isOpen && (
              <div style={s.detail}>
                {callers.map((caller, ci) => {
                  // The vertical guide stops at this row's midpoint when it's
                  // the last tree row (no chip rows follow) — an "└" elbow.
                  const last = ci === callers.length - 1 && !hasChips;
                  return (
                    <div key={ci} style={s.callerRow} title={caller.name}>
                      <span aria-hidden style={s.guideV(last)} />
                      <span aria-hidden style={s.guideH} />
                      <Icon.CornerDownRight size={13} aria-hidden style={s.callerIcon} />
                      <MonoLink wrap onClick={() => onNavigateToFile(caller.file, caller.line)}>
                        {caller.file}:{caller.line}
                      </MonoLink>
                    </div>
                  );
                })}

                {endpoints.length > 0 && (
                  <div style={s.chipRow}>
                    {endpoints.map((ep) => (
                      <Badge
                        key={ep}
                        mono
                        icon="Globe"
                        color="var(--accent-text)"
                        bg="var(--accent-bg)"
                        style={s.chip}
                      >
                        {ep}
                      </Badge>
                    ))}
                  </div>
                )}
                {crons.length > 0 && (
                  <div style={s.cronRow}>
                    {crons.map((cron) => (
                      <Badge key={cron} mono icon="Clock" color="var(--warn)" bg="var(--warn-bg)" style={s.chip}>
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
