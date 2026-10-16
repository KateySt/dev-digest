/* RiskAreasList — the "Risk Areas" block on the PR Overview tab: an
   accordion of risk rows (icon+color by kind — see ./constants) where each
   row expands independently, inline, directly under itself; multiple rows
   can be open at once. Follows the same Set<string> toggle pattern as
   BlastTree.tsx (`.../BlastRadiusPanel/_components/BlastTree`). Clicking a
   file ref (in the row preview OR its own expanded detail) jumps to that
   file:line on the Files-changed tab — DiffTab renders every risk's
   annotation inline on its own (see `buildRiskAnnotations`), so this jump is
   scroll+highlight only, not a data handoff. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { MonoLink } from "@/components/mono-link";
import { cn } from "@/lib/utils";
import { useRisks } from "@/lib/hooks/reviews";
import { parseFileRef } from "@/components/diff-viewer";
import { KIND_ICON, KIND_COLOR, type RiskKind } from "./constants";

export function RiskAreasList({
  prId,
  onNavigateToFile,
}: {
  prId: string | null | undefined;
  onNavigateToFile: (path: string, line: number) => void;
}) {
  const t = useTranslations("brief");
  const { data, isLoading } = useRisks(prId);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) return null;

  const risks = data?.risks ?? [];
  if (risks.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-elevated px-4 py-3.25 text-sm text-subtle-foreground">
        {t("noRisks")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {risks.map((risk, i) => {
        const kind = (risk.kind in KIND_ICON ? risk.kind : "other") as RiskKind;
        const color = KIND_COLOR[kind];
        const IconComp = Icon[KIND_ICON[kind]];
        // Title+kind is stable across re-fetches of the same review; index is
        // only a tiebreaker for the (rare) case of two risks sharing both.
        const key = `${risk.kind}:${risk.title}:${i}`;
        const isOpen = expanded.has(key);
        const firstRef = risk.file_refs[0];
        const firstTarget = firstRef ? parseFileRef(firstRef) : null;

        return (
          <div key={key}>
            <div
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => toggle(key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") toggle(key);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border border-l-3 bg-elevated px-3 py-2.5",
                isOpen ? color.border : "border-border",
              )}
            >
              <span className={cn("grid size-6.5 shrink-0 place-items-center rounded-[7px] bg-muted", color.text)}>
                <IconComp size={14} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">{risk.title}</span>
                {firstRef && (
                  // A file ref has no spaces; let it break inside the card instead of overflowing.
                  <span className="min-w-0 text-xs text-brand-text wrap-anywhere break-words">
                    {firstTarget ? (
                      <MonoLink
                        onClick={(e?: React.MouseEvent) => {
                          e?.stopPropagation();
                          onNavigateToFile(firstTarget.path, firstTarget.line);
                        }}
                      >
                        {firstRef}
                      </MonoLink>
                    ) : (
                      <span className="mono">{firstRef}</span>
                    )}
                  </span>
                )}
              </span>
              <Icon.ChevronDown
                size={14}
                aria-hidden
                className={cn("shrink-0 text-subtle-foreground transition-transform duration-150", isOpen && "rotate-180")}
              />
            </div>

            {isOpen && (
              <div className="mt-1 flex flex-col gap-2 rounded-lg border border-border bg-surface px-3.5 py-3">
                <p className="m-0 text-sm leading-[1.55] text-muted-foreground">{risk.explanation}</p>
                <div className="flex flex-wrap gap-3">
                  {risk.file_refs.map((ref, ri) => {
                    const target = parseFileRef(ref);
                    return (
                      // The row wraps between refs; each long ref still needs room to break within itself.
                      <div key={ri} className="max-w-full min-w-0 wrap-anywhere break-words">
                        <MonoLink
                          onClick={target ? () => onNavigateToFile(target.path, target.line) : undefined}
                        >
                          {ref}
                        </MonoLink>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
