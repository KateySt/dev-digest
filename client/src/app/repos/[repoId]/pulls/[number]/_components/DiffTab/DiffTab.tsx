"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, buildRiskAnnotations, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  useUpdatePrComment,
  useDeletePrComment,
  useSmartDiff,
  usePrReviews,
  useRisks,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import { FindingCard } from "../FindingCard";
import { ChangesOverview } from "./_components/ChangesOverview";
import type { PrFile, FindingActionKind } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  /** Deep-link target (e.g. from an Overview risk's file ref) — the matching
   *  file force-expands and the line scrolls into view + flashes. */
  targetFile?: string | null;
  targetLine?: number | null;
}

export function DiffTab({
  prId,
  filesCount,
  files,
  canComment,
  repoFullName,
  headSha,
  targetFile,
  targetLine,
}: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const update = useUpdatePrComment(prId);
  const del = useDeletePrComment(prId);
  // Every risk's file_ref, resolved to file+line — rendered inline wherever
  // it lands as soon as this tab opens, not just on the one you clicked from
  // Overview (that click still scrolls+highlights via targetFile/targetLine).
  const { data: risksData } = useRisks(prId);
  const riskAnnotations = React.useMemo(
    () => buildRiskAnnotations(risksData?.risks ?? []),
    [risksData],
  );

  // "Smart order" (grouped by role) is the default view; "Original order" is
  // the flat GitHub order — also the fallback while smart-diff is loading/errors,
  // so the diff is never blank.
  const [orderMode, setOrderMode] = React.useState<"smart" | "original">("smart");
  const { data: smartDiff, isLoading: smartDiffLoading, isError: smartDiffError } = useSmartDiff(prId);
  const groups =
    orderMode === "smart" && !smartDiffLoading && !smartDiffError ? smartDiff?.groups : undefined;

  // Findings-derived UI (counters, dot indicator, inline cards) derives from
  // the EXISTING reviews query — already invalidated by useRunReview and
  // useFindingAction — NOT from smart-diff's own (grouping-only) response.
  const { data: reviews } = usePrReviews(prId);
  const allFindings = React.useMemo(() => reviews?.flatMap((r) => r.findings) ?? [], [reviews]);
  const findingAction = useFindingAction();
  const handleFindingAction = React.useCallback(
    (findingId: string, action: FindingActionKind) => {
      if (!prId) return;
      findingAction.mutate({ findingId, action, prId });
    },
    [findingAction, prId],
  );

  // A single shared toggle hides/shows BOTH GitHub comment threads and inline
  // findings — visible whenever either has something to hide, otherwise a PR
  // with findings but zero GitHub comments has no way to hide them. Arriving
  // via a deep link (e.g. an Overview risk's file ref) starts them visible —
  // the whole point of the jump is to see what's flagged at that line.
  const [showAnnotations, setShowAnnotations] = React.useState(!!targetFile);
  const commentCount = comments?.length ?? 0;
  const hasAnnotations = commentCount > 0 || allFindings.length > 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments: showAnnotations,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowAnnotations(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
    updating: update.isPending,
    onUpdate: async (commentId, body) => {
      try {
        return await update.mutateAsync({ commentId, body });
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't update the comment on GitHub.");
        throw err;
      }
    },
    deleting: del.isPending,
    onDelete: async (commentId) => {
      try {
        return await del.mutateAsync(commentId);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't delete the comment on GitHub.");
        throw err;
      }
    },
  };

  const findingsApi: DiffFindingApi = {
    findings: allFindings,
    showFindings: showAnnotations,
    pending: findingAction.isPending,
    onAction: handleFindingAction,
    renderFinding: (f) => (
      <FindingCard
        f={f}
        defaultExpanded
        pending={findingAction.isPending}
        repoFullName={repoFullName}
        headSha={headSha}
        onAction={(action) => handleFindingAction(f.id, action)}
      />
    ),
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              kind="ghost"
              size="sm"
              active={orderMode === "smart"}
              onClick={() => setOrderMode("smart")}
            >
              {t("smartDiff.smartOrder")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              active={orderMode === "original"}
              onClick={() => setOrderMode("original")}
            >
              {t("smartDiff.originalOrder")}
            </Button>
            {hasAnnotations && (
              <Button
                kind="ghost"
                size="sm"
                icon={showAnnotations ? "EyeOff" : "Eye"}
                onClick={() => setShowAnnotations((v) => !v)}
              >
                {showAnnotations ? t("diffFindings.hide") : t("diffFindings.show")} (
                {commentCount + allFindings.length})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {orderMode === "smart" && !reviews?.length && (
        <div style={{ padding: "0 0 8px", fontSize: 12, color: "var(--text-muted)" }}>
          {t("smartDiff.notRunYet")}
        </div>
      )}

      {orderMode === "smart" && groups && (
        <ChangesOverview groups={groups} findings={allFindings} />
      )}

      <DiffViewer
        files={files}
        commenting={commenting}
        findings={findingsApi}
        groups={groups}
        targetFile={targetFile}
        targetLine={targetLine}
        riskAnnotations={riskAnnotations}
      />
    </section>
  );
}
