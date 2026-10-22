/* VerdictBanner — ported from findings.jsx.
   request_changes / approve / comment + summary + finding/blocker counts + score. */
"use client";

import { useTranslations } from "next-intl";
import { CircularScore } from "@/components/circular-score";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FindingRecord, RunSummary, Verdict } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsTooltip } from "@/components/findings-tooltip";
import { VERDICT_META } from "./constants";

export function VerdictBanner({
  verdict,
  summary,
  score,
  findingsCount,
  blockers,
  agentName,
  onRefresh,
  refreshing,
  disableRefresh,
  runSummary,
  findings,
  repoFullName,
  headSha,
  repoId,
  prNumber,
}: {
  verdict: Verdict;
  summary: string | null;
  score: number | null;
  findingsCount: number;
  blockers: number;
  agentName?: string | null;
  /** Manual "refresh PR brief" action (force-recompute intent/risks + re-run
   *  the review) — presentational only, orchestration lives in
   *  `useRefreshPrBrief` (see OverviewTab). Button renders only when supplied. */
  onRefresh?: () => void;
  refreshing?: boolean;
  disableRefresh?: boolean;
  runSummary?: RunSummary | null;
  findings?: FindingRecord[];
  repoFullName?: string | null;
  headSha?: string | null;
  repoId?: string | null;
  prNumber?: number | null;
}) {
  const t = useTranslations("prReview");
  const m = VERDICT_META[verdict] ?? VERDICT_META.comment;
  const VIcon = Icon[m.icon];
  return (
    <div className="flex items-start gap-4.5 rounded-xl border border-border bg-elevated p-4.5">
      <div className={cn("grid size-10 shrink-0 place-items-center rounded-[9px]", m.bg, m.text)}>
        <VIcon size={22} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("text-xl font-bold", m.text)}>{t(`verdict.${m.labelKey}`)}</span>
          <Badge variant="neutral">
            {t("verdict.findingsCount", { count: findingsCount })}
            {blockers > 0 ? t("verdict.blockers", { count: blockers }) : ""}
          </Badge>
          <FindingsTooltip
            trigger={
              <span className="inline-flex cursor-default items-center text-subtle-foreground" title={t("verdict.findingsInfo")}>
                <Icon.Info size={14} aria-hidden />
              </span>
            }
            findings={findings ?? []}
            repoFullName={repoFullName}
            headSha={headSha}
            repoId={repoId}
            prNumber={prNumber}
          />
          {agentName && (
            <Badge variant="brand">
              <Icon.Cpu aria-hidden />
              {agentName}
            </Badge>
          )}
        </div>
        {summary && <p className="mt-2 text-base leading-[1.55] text-muted-foreground">{summary}</p>}
      </div>
      {score != null && (
        <div className="flex shrink-0 flex-col items-center gap-1.25">
          <CircularScore score={score} size={52} stroke={5} />
          <span className="text-xs tracking-[0.04em] text-subtle-foreground">{t("verdict.prScore")}</span>
          {runSummary && (
            <RunCostBadge
              variant="detail"
              costUsd={runSummary.cost_usd}
              tokensIn={runSummary.tokens_in}
              tokensOut={runSummary.tokens_out}
            />
          )}
        </div>
      )}
      {onRefresh && (
        <div className="flex shrink-0 items-start">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={disableRefresh || refreshing}
            aria-label={t("verdict.refresh")}
            title={refreshing ? t("verdict.refreshing") : t("verdict.refresh")}
            onClick={onRefresh}
          >
            <Icon.RefreshCw className={refreshing ? "animate-dd-spin" : undefined} aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
