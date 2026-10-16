/* ReviewFocusList — the "Review Focus — Read These First" card on the PR
   Overview tab: a capped, severity-sorted shortlist of findings to read
   first (see ./helpers#topFindings — dismissed findings excluded, sorted by
   sortBySeverity, capped at REVIEW_FOCUS_LIMIT). Rendered as an accordion
   where each row expands independently in place — the same
   `useState<Set<string>>` + `toggle(key)` pattern as RiskAreasList.tsx /
   BlastTree.tsx, keyed by the finding's own stable `id` (not array index).
   Collapsed rows use a right-pointing chevron that rotates open — a
   different idiom from BlastTree's down-chevron, intentional per the
   mockup. Clicking a row's file:line reuses the same `onNavigateToFile`
   jump-to-file mechanism RiskAreasList/BlastTree already use — DiffTab
   renders every finding's annotation on its own, so this is scroll+
   highlight only, not a data handoff. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { MonoLink } from "@/components/mono-link";
import { SectionLabel } from "@/components/section-label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FindingRecord } from "@devdigest/shared";
import { topFindings } from "./helpers";

const CARD = "rounded-lg border border-border bg-elevated p-(--card-pad)";

export function ReviewFocusList({
  findings,
  onNavigateToFile,
}: {
  /** `null` = no review has run yet (data unavailable) — distinct from a
   *  review that ran and found nothing to flag (`[]`). See
   *  client/INSIGHTS.md's "not yet resolved vs confirmed empty" entry; don't
   *  collapse this with `?? []` at the call site. */
  findings: FindingRecord[] | null;
  onNavigateToFile: (path: string, line: number) => void;
}) {
  const t = useTranslations("brief");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (findings === null) {
    return (
      <div className={CARD}>
        <SectionLabel icon="ListChecks">{t("block.reviewFocus")}</SectionLabel>
        <EmptyState icon="ListChecks" title={t("unavailable")} body={t("unavailableHint")} />
      </div>
    );
  }

  const top = topFindings(findings);

  return (
    <div className={CARD}>
      <SectionLabel icon="ListChecks" right={<Badge variant="neutral">{top.length}</Badge>}>
        {t("block.reviewFocus")}
      </SectionLabel>

      {top.length === 0 ? (
        <div className="rounded-lg border border-border bg-elevated px-4 py-3.25 text-sm text-subtle-foreground">{t("reviewFocusEmpty")}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {top.map((finding: FindingRecord) => {
            const key = finding.id;
            const isOpen = expanded.has(key);

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
                    "flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2.25",
                    isOpen ? "bg-accent" : "bg-elevated",
                  )}
                >
                  {/* Right-pointing when collapsed, rotates open (unlike BlastTree's down-chevron). */}
                  <Icon.ChevronRight
                    size={14}
                    aria-hidden
                    className={cn("mt-0.5 shrink-0 text-subtle-foreground transition-transform duration-150", isOpen && "rotate-90")}
                  />
                  {/* File ref and description stacked so the description gets the full row width. */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {/* file:line has no spaces; let it break instead of overflowing (client/INSIGHTS.md). */}
                    <div className="min-w-0 wrap-anywhere break-words">
                      <MonoLink
                        onClick={(e?: React.MouseEvent) => {
                          e?.stopPropagation();
                          onNavigateToFile(finding.file, finding.start_line);
                        }}
                      >
                        {finding.file}:{finding.start_line}
                      </MonoLink>
                    </div>
                    <div className="flex min-w-0 gap-1.5">
                      <span className="shrink-0 text-sm text-subtle-foreground">—</span>
                      <span className="min-w-0 text-sm leading-normal text-muted-foreground">{finding.title}</span>
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-1 ml-5.5 rounded-lg border border-border bg-surface px-3 py-2.5">
                    <p className="m-0 text-sm leading-[1.55] text-muted-foreground">{finding.rationale}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
