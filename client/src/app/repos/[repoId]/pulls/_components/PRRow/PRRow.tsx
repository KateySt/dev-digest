/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsTooltip, SeverityCountBadges } from "@/components/findings-tooltip";
import { usePrReviews } from "@/lib/hooks/reviews";
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
}: {
  pr: PrMeta;
  repoId: string;
  repoFullName?: string | null;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed

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
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
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
    </div>
  );
}
