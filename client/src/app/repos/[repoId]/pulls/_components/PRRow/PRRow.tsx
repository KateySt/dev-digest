/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Icon, Avatar, Badge, CircularScore, HoverPopover } from "@devdigest/ui";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsTooltip, SeverityCountBadges } from "@/components/findings-tooltip";
import { RunReviewDropdown } from "@/components/run-review-dropdown";
import { usePrActiveRuns, usePrReviews } from "@/lib/hooks/reviews";
import { latestReview } from "@/lib/findings";
import type { PrMeta } from "@/lib/types";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";

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
  const [h, setH] = React.useState(false);
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
  React.useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      // Just settled — refresh the list so this row's score/findings/status/
      // cost update without a manual reload.
      qc.invalidateQueries({ queryKey: ["pulls", repoId] });
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, qc, repoId]);

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
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} avatarUrl={pr.avatar_url} size={18} />
        {pr.author}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        {showRiskTooltip ? (
          <HoverPopover
            trigger={
              <Badge color={SIZE_COLOR[size]} bg="transparent" style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}>
                {size} · {lines}
              </Badge>
            }
            width={220}
          >
            <div style={s.riskTooltip}>
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
          <Badge color={SIZE_COLOR[size]} bg="transparent" style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}>
            {size} · {lines}
          </Badge>
        )}
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
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
          <span style={s.muted}>—</span>
        )}
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div>
        <RunCostBadge costUsd={pr.cost_usd ?? null} />
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
      <div onClick={(e) => e.stopPropagation()} style={s.actionsCell}>
        {isRunning ? (
          <Badge icon="RefreshCw" color="var(--accent)" bg="var(--accent-bg)">
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
