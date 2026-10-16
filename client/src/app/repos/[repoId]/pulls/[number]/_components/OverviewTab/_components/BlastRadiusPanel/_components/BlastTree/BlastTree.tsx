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
import { Icon } from "@/components/icon";
import { MonoLink } from "@/components/mono-link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BlastRadius } from "@devdigest/shared";

/** Chips wrap long endpoint paths / cron names instead of overflowing the panel. */
const CHIP = "mono max-w-full min-w-0 whitespace-normal wrap-anywhere break-words";

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
    <div className="flex flex-col gap-0.5">
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
              // Flat row; an open group gets the hover tint as the selected header of its callers.
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1.5 py-1.25",
                isOpen ? "bg-accent" : "bg-transparent",
                hasCallers ? "cursor-pointer" : "cursor-default opacity-65",
              )}
            >
              {/* Fixed-width slot reserves the chevron's space even on rows
                 with no callers, so names stay aligned across rows. */}
              <span className="inline-flex w-3.25 shrink-0 justify-center">
                {hasCallers && (
                  <Icon.ChevronRight
                    size={13}
                    aria-hidden
                    className={cn("text-subtle-foreground transition-transform duration-120", isOpen && "rotate-90")}
                  />
                )}
              </span>
              <Icon.Code size={13} aria-hidden className="shrink-0 text-primary" />
              <span className="mono min-w-0 text-ui font-semibold text-foreground wrap-anywhere">
                {symbol.name}
                {(symbol.kind === "function" || symbol.kind === "method") && "()"}
              </span>
              <span className="ml-auto shrink-0 text-2xs text-subtle-foreground">{t("callerCount", { count: callers.length })}</span>
            </div>

            {isOpen && (
              <div className="pt-1 pb-2 pl-3.5">
                {callers.map((caller, ci) => {
                  // The vertical guide stops at this row's midpoint when it's
                  // the last tree row (no chip rows follow) — an "└" elbow.
                  const last = ci === callers.length - 1 && !hasChips;
                  return (
                    // min-w-0 + MonoLink wrap let an unbreakable file:line break (client/INSIGHTS.md).
                    <div key={ci} className="relative flex min-w-0 items-center gap-1.75 py-0.75 pl-4.5 text-ui" title={caller.name}>
                      <span aria-hidden className={cn("absolute top-0 left-2 w-px bg-border-strong", last ? "bottom-1/2" : "bottom-0")} />
                      <span aria-hidden className="absolute top-1/2 left-2 h-px w-2 bg-border-strong" />
                      <Icon.CornerDownRight size={13} aria-hidden className="shrink-0 text-subtle-foreground" />
                      <MonoLink wrap onClick={() => onNavigateToFile(caller.file, caller.line)}>
                        {caller.file}:{caller.line}
                      </MonoLink>
                    </div>
                  );
                })}

                {endpoints.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2 pb-0.5 pl-4.5">
                    {endpoints.map((ep) => (
                      <Badge key={ep} variant="brand" className={CHIP}>
                        <Icon.Globe aria-hidden />
                        {ep}
                      </Badge>
                    ))}
                  </div>
                )}
                {crons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1.5 pb-0.5 pl-4.5">
                    {crons.map((cron) => (
                      <Badge key={cron} variant="warn" className={CHIP}>
                        <Icon.Clock aria-hidden />
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
