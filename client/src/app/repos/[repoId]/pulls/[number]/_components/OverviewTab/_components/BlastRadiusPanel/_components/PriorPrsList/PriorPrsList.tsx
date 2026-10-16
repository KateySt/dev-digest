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
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { MonoLink } from "@/components/mono-link";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePrHistory } from "@/lib/hooks/reviews";

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
    <div className="overflow-hidden rounded-[7px] border border-border">
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
        className={cn("flex cursor-pointer items-center gap-2 px-3 py-2.25 text-foreground", expanded ? "bg-surface" : "bg-transparent")}
      >
        <Icon.History size={14} aria-hidden className="shrink-0 text-subtle-foreground" />
        <span className="text-ui font-semibold">{t("history.label")}</span>
        {/* Only shown once the count is actually known — a `?? 0` fallback
           here would flash a misleading "(0)" while still loading. */}
        {data && <Badge variant="neutral">{data.history.length}</Badge>}
        <Icon.ChevronDown
          size={15}
          aria-hidden
          className={cn("ml-auto shrink-0 text-subtle-foreground transition-transform duration-150", expanded && "rotate-180")}
        />
      </div>

      {expanded && (
        <div className="border-t border-border py-1">
          {isLoading ? null : !data ? (
            <div className="px-3.5 py-2">
              <EmptyState icon="GitPullRequest" title={t("history.unavailable")} body={t("history.unavailableHint")} />
            </div>
          ) : data.history.length === 0 ? (
            <div className="px-3.5 py-2.5 text-sm text-subtle-foreground">{t("history.empty")}</div>
          ) : (
            data.history.map((item, i) => {
              const last = i === data.history.length - 1;
              return (
                // min-w-0: free-form titles/paths must be able to shrink and wrap (client/INSIGHTS.md).
                <div key={item.pr_number} className={cn("flex min-w-0 gap-3 px-3.5 py-2.5", !last && "border-b border-border")}>
                  <div className="flex flex-col items-center pt-0.75" aria-hidden>
                    <span className="box-content size-2 rounded-full border-2 border-elevated bg-subtle-foreground" />
                    {!last && <span className="mt-0.5 w-px flex-1 bg-border" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mono text-xs text-brand-text">
                        #{item.pr_number}
                      </span>
                      <span className="min-w-0 text-sm font-semibold text-foreground wrap-anywhere break-words">{item.title}</span>
                    </div>
                    <div className="mt-1 mb-1.5 flex items-center gap-2 text-[11.5px] text-subtle-foreground">
                      <UserAvatar name={item.author} size={15} />
                      {item.author} · {t("history.merged", { date: new Date(item.merged_at) })}
                    </div>
                    <div className="text-ui leading-normal text-muted-foreground">{item.notes}</div>
                    {item.files_overlap.length > 0 && (
                      <div className="mt-1.5 flex flex-col gap-1">
                        {item.files_overlap.map((path) => (
                          <div key={path} className="min-w-0">
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
