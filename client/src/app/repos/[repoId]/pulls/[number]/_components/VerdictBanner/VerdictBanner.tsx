/* VerdictBanner — ported from findings.jsx.
   request_changes / approve / comment + summary + finding/blocker counts + score. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, CircularScore, Button } from "@devdigest/ui";
import type { FindingRecord, RunSummary, Verdict } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsTooltip } from "@/components/findings-tooltip";
import { VERDICT_META } from "./constants";
import { s } from "./styles";

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
    <div style={s.wrap}>
      <div style={s.iconBox(m.bg, m.c)}>
        <VIcon size={22} />
      </div>
      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.label(m.c)}>{t(`verdict.${m.labelKey}`)}</span>
          <Badge color="var(--text-secondary)">
            {t("verdict.findingsCount", { count: findingsCount })}
            {blockers > 0 ? t("verdict.blockers", { count: blockers }) : ""}
          </Badge>
          <FindingsTooltip
            trigger={
              <span style={s.infoTrigger} title={t("verdict.findingsInfo")}>
                <Icon.Info size={14} />
              </span>
            }
            findings={findings ?? []}
            repoFullName={repoFullName}
            headSha={headSha}
            repoId={repoId}
            prNumber={prNumber}
          />
          {agentName && (
            <Badge color="var(--accent-text)" bg="var(--accent-bg)" icon="Cpu">
              {agentName}
            </Badge>
          )}
        </div>
        {summary && <p style={s.summary}>{summary}</p>}
      </div>
      {score != null && (
        <div style={s.scoreCol}>
          <CircularScore score={score} size={52} stroke={5} />
          <span style={s.scoreLabel}>{t("verdict.prScore")}</span>
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
        <div style={s.actionsCol}>
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={refreshing}
            disabled={disableRefresh}
            aria-label={t("verdict.refresh")}
            title={refreshing ? t("verdict.refreshing") : t("verdict.refresh")}
            onClick={onRefresh}
          />
        </div>
      )}
    </div>
  );
}
