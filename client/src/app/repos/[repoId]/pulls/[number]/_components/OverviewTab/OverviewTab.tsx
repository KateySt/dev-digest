"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Card, EmptyState } from "@devdigest/ui";
import type { ReviewRecord, Verdict } from "@devdigest/shared";
import { IntentPanel } from "./_components/IntentPanel";
import { RiskAreasList } from "./_components/RiskAreasList";
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
}

export function OverviewTab({ prBody, prId, reviews, onNavigateToFile }: OverviewTabProps) {
  const t = useTranslations("brief");
  // Reviews arrive newest-first — the latest run is what "the PR brief" means.
  const latestReview = reviews[0] ?? null;
  const blockers = latestReview
    ? latestReview.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length
    : 0;

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
            <Card>
              <EmptyState icon="GitBranch" title={t("block.blast")} body={t("unavailableHint")} />
            </Card>
          </section>
        </div>
      </div>

      <section>
        <SectionLabel icon="History">{t("block.history")}</SectionLabel>
        <div style={s.placeholderHint}>{t("noHistory")}</div>
      </section>
    </>
  );
}
