"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { SectionLabel } from "@/components/section-label";
import type { ReviewRecord, RunSummary, Verdict } from "@devdigest/shared";
import { useRefreshPrBrief } from "@/lib/hooks/reviews";
import { IntentPanel } from "./_components/IntentPanel";
import { RiskAreasList } from "./_components/RiskAreasList";
import { ReviewFocusList } from "./_components/ReviewFocusList";
import { BlastRadiusPanel } from "./_components/BlastRadiusPanel";
import { CommitHistoryPanel } from "./_components/CommitHistoryPanel";
import { VerdictBanner } from "../VerdictBanner";

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
          <SectionLabel icon="MessageSquare">{t("sections.description")}</SectionLabel>
          <div className="rounded-lg border border-border bg-elevated p-4.5 text-base leading-[1.55] whitespace-pre-wrap text-muted-foreground">
            {prBody}
          </div>
        </section>
      )}

      <section>
        <SectionLabel icon="FileText">{t("sections.prBrief")}</SectionLabel>
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

      {/* minmax(0, 1fr), not a bare 1fr: a bare track's minimum is its content's
          max-content width, so an unbreakable mono path would blow the column past
          the panel instead of letting the child's ellipsis apply. */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Merged card: Intent + Risk Areas share one border/Card (see
             client/INSIGHTS.md's "not yet resolved vs confirmed empty" —
             both headers render unconditionally so the card shell never
             looks like an empty box with just a divider while intent is
             still loading; each section's own body independently renders
             its own loading/empty state, same as before the merge). */}
          <div className="rounded-lg border border-border bg-elevated p-(--card-pad)">
            <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
            <IntentPanel prId={prId} />
            <div className="my-4.5 border-t border-border" />
            <SectionLabel icon="AlertTriangle">{t("block.risks")}</SectionLabel>
            <RiskAreasList prId={prId} onNavigateToFile={onNavigateToFile} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
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
