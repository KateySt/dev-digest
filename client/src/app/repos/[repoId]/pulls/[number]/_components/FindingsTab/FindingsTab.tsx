"use client";

import React, { useCallback } from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { SectionLabel } from "@/components/section-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActiveRun } from "@/lib/hooks/reviews";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory/RunHistory";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import type { FindingRecord, ReviewRecord, RunSummary, PrCommit } from "@devdigest/shared";
import type { UseMutationResult } from "@tanstack/react-query";

interface FindingsTabProps {
  prId: string | null;
  liveRunIds: string[];
  /** In-flight runs (queued/running) incl. queue positions. */
  activeRuns?: ActiveRun[];
  reviewRunning: boolean;
  lethalTrifecta: FindingRecord[];
  runs: ReviewRecord[];
  prRuns: RunSummary[] | undefined;
  prCommits: PrCommit[];
  cancelMutation: UseMutationResult<any, any, string, any>;
  repoId?: string | null;
  prNumber?: number | null;
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  targetFindingId?: string | null;
  onOpenTrace: (id: string) => void;
  onDelete: (id: string) => void;
  onRunDone: () => void;
}

export function FindingsTab({
  prId,
  liveRunIds,
  activeRuns = [],
  reviewRunning,
  lethalTrifecta,
  runs,
  prRuns,
  prCommits,
  cancelMutation,
  repoId,
  prNumber,
  repoFullName,
  headSha,
  targetFindingId,
  onOpenTrace,
  onDelete,
  onRunDone,
}: FindingsTabProps) {
  const t = useTranslations("prReview.findingsTab");
  const handleCancelAll = useCallback(() => {
    liveRunIds.forEach((id) => cancelMutation.mutate(id));
  }, [liveRunIds, cancelMutation]);

  const handleOpenFirstTrace = useCallback(() => {
    if (liveRunIds[0]) onOpenTrace(liveRunIds[0]);
  }, [liveRunIds, onOpenTrace]);

  const handleOpenTrace = useCallback(
    (id: string) => {
      onOpenTrace(id);
    },
    [onOpenTrace],
  );

  const handleDelete = useCallback(
    (id: string) => {
      onDelete(id);
    },
    [onDelete],
  );

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // opens + scrolls to that run's accordion below. The nonce re-triggers the
  // scroll even when the same run is clicked twice.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const handleGoToReview = useCallback((runId: string) => {
    setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));
  }, []);

  const processedFindingRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!targetFindingId || processedFindingRef.current === targetFindingId) return;
    const run = runs.find((r) => r.findings.some((f) => f.id === targetFindingId));
    if (!run?.run_id) return;
    processedFindingRef.current = targetFindingId;
    setTarget((p) => ({ runId: run.run_id!, n: (p?.n ?? 0) + 1 }));
  }, [targetFindingId, runs]);

  const findingsByRunId = React.useMemo(() => {
    const m = new Map<string, FindingRecord[]>();
    for (const r of runs) if (r.run_id) m.set(r.run_id, r.findings);
    return m;
  }, [runs]);

  const queuePositions = React.useMemo(
    () => Object.fromEntries(activeRuns.map((r) => [r.run_id, r.queue_position ?? null])),
    [activeRuns],
  );

  return (
    <section>
      {liveRunIds.length > 0 && (
        <div className="mb-4.5">
          <SectionLabel
            icon="Sparkles"
            right={
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" disabled={cancelMutation.isPending} onClick={handleCancelAll}>
                  {cancelMutation.isPending ? <Icon.Loader className="animate-spin" aria-hidden /> : <Icon.X aria-hidden />}
                  {t("cancel")}
                </Button>
                <Button variant="outline" size="sm" onClick={handleOpenFirstTrace}>
                  <Icon.FileText aria-hidden />
                  {t("openTrace")}
                </Button>
              </div>
            }
          >
            {t("liveReview")}
          </SectionLabel>
          <RunStatus runIds={liveRunIds} activeRuns={activeRuns} onDone={onRunDone} />
        </div>
      )}

      {reviewRunning && (
        <div className="mb-4.5 flex items-center gap-3 rounded-lg border border-border-strong bg-elevated px-4 py-3">
          <Icon.RefreshCw size={16} className="animate-dd-spin text-primary" aria-hidden />
          <span className="text-base font-semibold text-foreground">{t("inProgress")}</span>
          <span className="text-sm text-muted-foreground">{t("inProgressHint")}</span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div className="mb-4.5 flex items-center gap-3 rounded-lg border border-crit bg-crit-bg px-4 py-3">
          <Icon.Shield size={16} className="text-crit" aria-hidden />
          <span className="text-base font-bold text-crit">{t("trifectaTitle")}</span>
          <Badge variant="ghost" className="text-crit">
            {t("trifectaCount", { count: lethalTrifecta.length })}
          </Badge>
        </div>
      )}

      {((prRuns && prRuns.length > 0) || prCommits.length > 0) && (
        <div className="mb-4.5">
          <SectionLabel icon="Activity" right={<span className="text-xs text-subtle-foreground">{t("timelineHint")}</span>}>
            {t("timeline")}
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            commits={prCommits}
            queuePositions={queuePositions}
            findingsByRunId={findingsByRunId}
            repoId={repoId}
            prNumber={prNumber}
            repoFullName={repoFullName}
            headSha={headSha}
            onOpenTrace={handleOpenTrace}
            onGoToReview={handleGoToReview}
            onDelete={handleDelete}
          />
        </div>
      )}

      <SectionLabel icon="AlertOctagon" right={<span className="text-xs text-subtle-foreground">{t("reviewRunsHint")}</span>}>
        {t("reviewRuns")}
      </SectionLabel>
      {runs.length === 0 ? (
        reviewRunning || liveRunIds.length > 0 ? null : (
          <EmptyState icon="Sparkles" title={t("emptyTitle")} body={t("emptyBody")} />
        )
      ) : (
        prId &&
        runs.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            prId={prId}
            defaultOpen={i === 0}
            repoFullName={repoFullName}
            headSha={headSha}
            targetRunId={target?.runId ?? null}
            targetNonce={target?.n ?? 0}
            targetFindingId={targetFindingId}
          />
        ))
      )}
    </section>
  );
}
