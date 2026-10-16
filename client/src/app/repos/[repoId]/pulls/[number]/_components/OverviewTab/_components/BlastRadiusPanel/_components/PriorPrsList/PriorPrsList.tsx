/* PriorPrsList — the "Prior PRs touching these files" collapsible footer
   inside BlastRadiusPanel's Card (see BlastRadiusPanel.tsx). Its own header
   row (icon + label + count badge) IS the section's collapse/expand toggle —
   a single boolean, not BlastTree's per-row `Set<string>` pattern, since this
   collapses one list, not N independent rows. Rendered as its own bordered
   box; starts collapsed, matching the mockup (chevron shown, no rows visible
   under it). Expanded rows are a dot-and-line timeline, newest first. Data (`usePrHistory`) is
   a live, uncached read server-side — see `HistoryService`'s doc comment —
   so, unlike blast, there's no `?force` refresh to wire up here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Avatar, Badge, EmptyState, Icon, MonoLink } from "@devdigest/ui";
import { usePrHistory } from "@/lib/hooks/reviews";
import { s } from "./styles";

export function PriorPrsList({
  prId,
  onNavigateToFile,
}: {
  prId: string | null | undefined;
  onNavigateToFile: (path: string, line: number) => void;
}) {
  const t = useTranslations("blast");
  const { data, isLoading } = usePrHistory(prId);
  const [expanded, setExpanded] = React.useState(false);

  const toggle = () => setExpanded((e) => !e);

  return (
    <div style={s.wrap}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        style={s.header(expanded)}
      >
        <Icon.History size={14} aria-hidden style={s.headerIcon} />
        <span style={s.headerLabel}>{t("history.label")}</span>
        {/* Only shown once the count is actually known — a `?? 0` fallback
           here would flash a misleading "(0)" while still loading. */}
        {data && <Badge color="var(--text-secondary)">{data.history.length}</Badge>}
        <Icon.ChevronDown size={15} aria-hidden style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          {isLoading ? null : !data ? (
            <div style={s.bodyPad}>
              <EmptyState icon="GitPullRequest" title={t("history.unavailable")} body={t("history.unavailableHint")} />
            </div>
          ) : data.history.length === 0 ? (
            <div style={s.placeholderHint}>{t("history.empty")}</div>
          ) : (
            data.history.map((item, i) => {
              const last = i === data.history.length - 1;
              return (
                <div key={item.pr_number} style={s.item(last)}>
                  <div style={s.timeline} aria-hidden>
                    <span style={s.timelineDot} />
                    {!last && <span style={s.timelineLine} />}
                  </div>
                  <div style={s.itemBody}>
                    <div style={s.itemTitleRow}>
                      <span className="mono" style={s.itemNumber}>
                        #{item.pr_number}
                      </span>
                      <span style={s.itemTitle}>{item.title}</span>
                    </div>
                    <div style={s.itemMeta}>
                      <Avatar name={item.author} size={15} />
                      {item.author} · {t("history.merged", { date: new Date(item.merged_at) })}
                    </div>
                    <div style={s.itemNotes}>{item.notes}</div>
                    {item.files_overlap.length > 0 && (
                      <div style={s.fileList}>
                        {item.files_overlap.map((path) => (
                          <div key={path} style={s.fileRow}>
                            {/* No line number in the contract — defaults to 1,
                               same idiom as CommitHistoryPanel's `file.line ?? 1`. */}
                            <MonoLink wrap onClick={() => onNavigateToFile(path, 1)}>
                              {path}
                            </MonoLink>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
