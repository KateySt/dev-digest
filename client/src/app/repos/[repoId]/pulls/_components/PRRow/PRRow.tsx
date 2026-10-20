/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { CircularScore } from "@/components/circular-score";
import { UserAvatar } from "@/components/user-avatar";
import { HoverPopover } from "@/components/hover-popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsTooltip, SeverityCountBadges } from "@/components/findings-tooltip";
import { RunReviewDropdown } from "@/components/run-review-dropdown";
import { usePrActiveRuns, usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import { latestReview } from "@/lib/findings";
import type { PrMeta } from "@/lib/types";
import { GRID_COLS, NARROW_ONLY, SIZE_CLASS, STATUS_META, WIDE_ONLY } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";

const EMPTY_FINDINGS_COUNTS = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } as const;

export function PRRow({
  pr,
  repoId,
  repoFullName,
  showRiskTooltip,
}: {
  pr: PrMeta;
  repoId: string;
  repoFullName?: string | null;
  /** SPEC-05 C-AC-33 — explain the "Highest risk" sort's ranking values;
   *  only meaningful (and rendered) while that sort is selected. */
  showRiskTooltip?: boolean;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const qc = useQueryClient();
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed

  // SPEC-05 C-AC-14/15 — the row's own Run Review action (and any run
  // "Review all" started for this PR) reflected in place. `usePrActiveRuns`
  // already self-stops polling once nothing is running (client/src/lib/hooks/
  // reviews.ts) — reused as-is rather than opening a new EventSource per row,
  // which is exactly the fan-out C-AC-28 forbids.
  const { data: activeRuns } = usePrActiveRuns(pr.id);
  const isRunning = (activeRuns?.length ?? 0) > 0;
  const wasRunningRef = React.useRef(false);
  // Flips true once a run this row watched has settled; only then is the run
  // history fetched (C-AC-15/25) - no extra request while it is still running,
  // and nothing is ever retried automatically (C-AC-27).
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      // Just settled - refresh the list so this row's score/findings/status/
      // cost update without a manual reload.
      qc.invalidateQueries({ queryKey: ["pulls", repoId] });
      setSettled(true);
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, qc, repoId]);
  // `undefined` (not fetched) stays distinct from `[]` (fetched, no runs).
  const { data: runs } = usePrRuns(settled ? pr.id : null);
  const newestRun = runs?.reduce<(typeof runs)[number] | undefined>(
    (best, r) => (!best || Date.parse(r.ran_at ?? "") > Date.parse(best.ran_at ?? "") ? r : best),
    undefined,
  );
  const failedRun = !isRunning && newestRun?.status === "failed" ? newestRun : null;

  const [hasHoveredFindings, setHasHoveredFindings] = React.useState(false);
  const { data: reviews } = usePrReviews(hasHoveredFindings ? pr.id : null);
  const hoveredFindings = reviews ? latestReview(reviews)?.findings : undefined;
  const findingsCounts = pr.findings ?? EMPTY_FINDINGS_COUNTS;
  const totalFindings = findingsCounts.CRITICAL + findingsCounts.WARNING + findingsCounts.SUGGESTION;
  const handleFindingsOpenChange = React.useCallback((open: boolean) => {
    if (open) setHasHoveredFindings(true);
  }, []);
  return (
    <div
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      className={cn(
        "group/row grid cursor-pointer items-center gap-3.5 border-b border-border px-5 py-3 transition-colors duration-100 hover:bg-surface",
        GRID_COLS,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Icon.GitPullRequest size={15} className={cn("shrink-0", st.text)} aria-hidden />
        <div className="min-w-0">
          <div className="truncate text-base font-[550] text-foreground group-hover/row:text-brand-text">{pr.title}</div>
          <span className="mono text-xs text-subtle-foreground">
            #{pr.number}
            {pr.updated_at && <span className={NARROW_ONLY}> · {relativeTime(pr.updated_at)}</span>}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <UserAvatar name={pr.author} avatarUrl={pr.avatar_url} size={18} />
        {pr.author}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        {showRiskTooltip ? (
          <HoverPopover
            trigger={
              <Badge variant="outline" className={SIZE_CLASS[size]}>
                {size} · {lines}
              </Badge>
            }
            className="w-55"
          >
            <div className="flex flex-col gap-1.5 px-3 py-2.5 text-ui text-muted-foreground">
              <div>{t("list.riskTooltip.diffSize", { lines })}</div>
              <div>
                {pr.blast_size != null
                  ? t("list.riskTooltip.blastSize", { count: pr.blast_size })
                  : t("list.riskTooltip.blastSizeUnavailable")}
              </div>
              <div>
                {pr.score != null
                  ? t("list.riskTooltip.score", { score: pr.score })
                  : t("list.riskTooltip.scoreUnavailable")}
              </div>
            </div>
          </HoverPopover>
        ) : (
          <Badge variant="outline" className={SIZE_CLASS[size]}>
            {size} · {lines}
          </Badge>
        )}
      </div>
      <div className="flex items-center">
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span className="text-subtle-foreground">—</span>
        )}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        {totalFindings > 0 ? (
          <FindingsTooltip
            trigger={<SeverityCountBadges counts={findingsCounts} />}
            findings={hoveredFindings}
            loading={hasHoveredFindings && !reviews}
            repoFullName={repoFullName}
            headSha={pr.head_sha}
            repoId={repoId}
            prNumber={pr.number}
            onOpenChange={handleFindingsOpenChange}
          />
        ) : (
          <span className="text-subtle-foreground">—</span>
        )}
      </div>
      <div>
        <Badge variant="ghost" className={cn("gap-1.5 px-0", st.text)}>
          <span aria-hidden className={cn("size-1.5 rounded-full", st.dot)} />
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div className={WIDE_ONLY}>
        <RunCostBadge costUsd={pr.cost_usd ?? null} />
      </div>
      <div className={cn("text-right text-xs text-subtle-foreground", WIDE_ONLY)}>{relativeTime(pr.updated_at)}</div>
      <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-end gap-2">
        {failedRun && (
          <span
            title={
              failedRun.error
                ? t("list.rowFailedTitle", { error: failedRun.error })
                : t("list.rowFailedNoReason")
            }
          >
            <Badge variant="ghost" className="text-crit">
              <Icon.AlertTriangle aria-hidden />
              {t("list.rowFailed")}
            </Badge>
          </span>
        )}
        {isRunning ? (
          <Badge variant="brand">
            <Icon.RefreshCw aria-hidden />
            {t("runReview.running")}
          </Badge>
        ) : (
          pr.id && (
            <RunReviewDropdown
              prId={pr.id}
              size="sm"
              kind="secondary"
              warnMerged={pr.status === "merged" || pr.status === "closed"}
              ariaLabel={t("runReview.runReviewFor", { number: pr.number, title: pr.title })}
            />
          )
        )}
      </div>
    </div>
  );
}
