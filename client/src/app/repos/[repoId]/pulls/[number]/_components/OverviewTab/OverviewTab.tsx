"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, EmptyState } from "@devdigest/ui";
import type { ReviewRecord, RunSummary, Verdict } from "@devdigest/shared";
import { useRefreshPrBrief } from "@/lib/hooks/reviews";
import { IntentPanel } from "./_components/IntentPanel";
import { RiskAreasList } from "./_components/RiskAreasList";
import { BlastRadiusPanel } from "./_components/BlastRadiusPanel";
import { CommitHistoryPanel } from "./_components/CommitHistoryPanel";
import { VerdictBanner } from "../VerdictBanner";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null | undefined;
  reviews: ReviewRecord[];
  /** Jump to a file:line on the Files-changed tab — wired by page.tsx (sets
   *  ?tab=diff&file=&line=; DiffTab independently renders every risk inline,
   *  so this is scroll+highlight only, not a data handoff). */
  onNavigateToFile: (path: string, line: number) => void;
  /** Every run's summary row (already fetched for the Findings tab) — matched
   *  by run_id to the latest review to surface its cost/token line. */
  prRuns?: RunSummary[];
  /** True while any agent run is in flight — disables the refresh button so a
   *  manual refresh can't overlap a run already underway. */
  reviewRunning?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  repoId?: string | null;
  prNumber?: number | null;
}

export function OverviewTab({
  prBody,
  prId,
  reviews,
  onNavigateToFile,
  prRuns,
  reviewRunning,
  repoFullName,
  headSha,
  repoId,
  prNumber,
}: OverviewTabProps) {
  const t = useTranslations("brief");
  const tc = useTranslations("commits");
  const { refresh, isPending: refreshing } = useRefreshPrBrief(prId);
  // Reviews arrive newest-first — the latest run is what "the PR brief" means.
  const latestReview = reviews[0] ?? null;
  const blockers = latestReview
    ? latestReview.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length
    : 0;
  const runSummary = prRuns?.find((r) => r.run_id === latestReview?.run_id) ?? null;

  return (
    <>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}

      <section>
        <SectionLabel icon="FileText">PR brief</SectionLabel>
        {latestReview?.verdict ? (
          <VerdictBanner
            verdict={latestReview.verdict as Verdict}
            summary={latestReview.summary}
            score={latestReview.score}
            findingsCount={latestReview.findings.length}
            blockers={blockers}
            agentName={latestReview.agent_name}
            onRefresh={() => refresh()}
            refreshing={refreshing}
            disableRefresh={reviewRunning}
            runSummary={runSummary}
            findings={latestReview.findings}
            repoFullName={repoFullName}
            headSha={headSha}
            repoId={repoId}
            prNumber={prNumber}
          />
        ) : (
          <EmptyState icon="FileText" title={t("unavailable")} body={t("unavailableHint")} />
        )}
      </section>

      <div style={s.grid}>
        <div style={s.gridCol}>
          <IntentPanel prId={prId} />
          <section>
            <SectionLabel icon="AlertTriangle">{t("block.risks")}</SectionLabel>
            <RiskAreasList prId={prId} onNavigateToFile={onNavigateToFile} />
          </section>
        </div>
        <div style={s.gridCol}>
          <section>
            <SectionLabel icon="GitBranch">{t("block.blast")}</SectionLabel>
            <BlastRadiusPanel prId={prId} onNavigateToFile={onNavigateToFile} />
          </section>
        </div>
      </div>

      <section>
        <SectionLabel icon="History">{tc("label")}</SectionLabel>
        <CommitHistoryPanel prId={prId} onNavigateToFile={onNavigateToFile} />
      </section>
    </>
  );
}
