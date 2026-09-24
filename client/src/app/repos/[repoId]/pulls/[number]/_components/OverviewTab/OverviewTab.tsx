"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, EmptyState, Card } from "@devdigest/ui";
import type { ReviewRecord, RunSummary, Verdict } from "@devdigest/shared";
import { useRefreshPrBrief } from "@/lib/hooks/reviews";
import { IntentPanel } from "./_components/IntentPanel";
import { RiskAreasList } from "./_components/RiskAreasList";
import { ReviewFocusList } from "./_components/ReviewFocusList";
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

      {/* Full-width, above the two-column grid — "what to focus on" reads
         before the detailed Intent/Risk Areas/Blast Radius panels. `null`
         (not `[]`) when there's no review yet, so ReviewFocusList can tell
         "not yet resolved" apart from "reviewed, nothing to flag" (see
         client/INSIGHTS.md). */}
      <ReviewFocusList
        findings={latestReview ? latestReview.findings : null}
        onNavigateToFile={onNavigateToFile}
      />

      <div style={s.grid}>
        <div style={s.gridCol}>
          {/* Merged card: Intent + Risk Areas share one border/Card (see
             client/INSIGHTS.md's "not yet resolved vs confirmed empty" —
             both headers render unconditionally so the card shell never
             looks like an empty box with just a divider while intent is
             still loading; each section's own body independently renders
             its own loading/empty state, same as before the merge). */}
          <Card>
            <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
            <IntentPanel prId={prId} />
            <div style={s.divider} />
            <SectionLabel icon="AlertTriangle">{t("block.risks")}</SectionLabel>
            <RiskAreasList prId={prId} onNavigateToFile={onNavigateToFile} />
          </Card>
        </div>
        <div style={s.gridCol}>
          {/* BlastRadiusPanel renders its own "BLAST RADIUS" header as the
             first row inside its Card (in all three of its states — see
             BlastRadiusPanel.tsx) rather than as a sibling SectionLabel here,
             so the header stays inside the bordered panel like the mockup. */}
          <BlastRadiusPanel prId={prId} onNavigateToFile={onNavigateToFile} />
        </div>
      </div>

      <section>
        <SectionLabel icon="History">{tc("label")}</SectionLabel>
        <CommitHistoryPanel prId={prId} onNavigateToFile={onNavigateToFile} />
      </section>
    </>
  );
}
