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
import { Badge, Card, EmptyState, Icon, MonoLink, SectionLabel } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { topFindings } from "./helpers";
import { s } from "./styles";

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
      <Card>
        <SectionLabel icon="ListChecks">{t("block.reviewFocus")}</SectionLabel>
        <EmptyState icon="ListChecks" title={t("unavailable")} body={t("unavailableHint")} />
      </Card>
    );
  }

  const top = topFindings(findings);

  return (
    <Card>
      <SectionLabel icon="ListChecks" right={<Badge>{top.length}</Badge>}>
        {t("block.reviewFocus")}
      </SectionLabel>

      {top.length === 0 ? (
        <div style={s.placeholderHint}>{t("reviewFocusEmpty")}</div>
      ) : (
        <div style={s.wrap}>
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
                  style={s.row(isOpen)}
                >
                  <Icon.ChevronRight size={14} aria-hidden style={s.chevron(isOpen)} />
                  <div style={s.content}>
                    <div style={s.fileRef}>
                      <MonoLink
                        onClick={(e?: React.MouseEvent) => {
                          e?.stopPropagation();
                          onNavigateToFile(finding.file, finding.start_line);
                        }}
                      >
                        {finding.file}:{finding.start_line}
                      </MonoLink>
                    </div>
                    <div style={s.descriptionRow}>
                      <span style={s.dash}>—</span>
                      <span style={s.description}>{finding.title}</span>
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div style={s.detail}>
                    <p style={s.detailText}>{finding.rationale}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
