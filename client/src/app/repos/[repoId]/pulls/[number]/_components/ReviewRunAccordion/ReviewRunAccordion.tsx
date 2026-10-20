/* ReviewRunAccordion — one collapsible review RUN (a single agent's pass over
   the PR). Header shows agent + verdict + counts + score + when it ran; the
   body holds that run's VerdictBanner summary and its own FindingsPanel. A PR
   can have many runs (different agents / re-runs over time) — each is separate
   and collapsible so older runs don't bury the latest. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReviewRecord, Verdict } from "@devdigest/shared";
import { SeverityChip } from "@/components/SeverityChip/SeverityChip";
import { FindingsPanel } from "../FindingsPanel";
import { VerdictBanner } from "../VerdictBanner";
import { useDeleteReview } from "../../../../../../../lib/hooks/reviews";

const VERDICT_TEXT: Record<string, string> = {
  request_changes: "text-crit",
  comment: "text-warn",
  approve: "text-ok",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function ReviewRunAccordion({
  review,
  prId,
  defaultOpen = false,
  repoFullName,
  headSha,
  targetRunId = null,
  targetNonce = 0,
  targetFindingId = null,
}: {
  review: ReviewRecord;
  prId: string;
  defaultOpen?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** When this matches review.run_id, the accordion opens and scrolls into view
   *  (driven from the Timeline: clicking an agent name navigates here). */
  targetRunId?: string | null;
  targetNonce?: number;
  targetFindingId?: string | null;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [pendingScroll, setPendingScroll] = React.useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `targetNonce` is a deliberate re-trigger for repeated jumps to the same run
  React.useEffect(() => {
    if (review.run_id && review.run_id === targetRunId) {
      setOpen(true);
      setPendingScroll(true);
    }
  }, [targetRunId, targetNonce, review.run_id]);

  React.useEffect(() => {
    if (!open || !pendingScroll) return;
    setPendingScroll(false);
    const findingEl = targetFindingId
      ? document.querySelector(`[data-finding-id="${targetFindingId}"]`)
      : null;
    (findingEl ?? rootRef.current)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open, pendingScroll, targetFindingId]);
  const del = useDeleteReview(prId);
  const findings = review.findings;
  const blockers = findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
  const criticalCount = findings.filter((f) => f.severity === "CRITICAL").length;
  const warningCount = findings.filter((f) => f.severity === "WARNING").length;
  const suggestionCount = findings.filter((f) => f.severity === "SUGGESTION").length;
  const verdictText = (review.verdict && VERDICT_TEXT[review.verdict]) || "text-subtle-foreground";

  return (
    <div
      ref={rootRef}
      id={review.run_id ? `review-run-${review.run_id}` : undefined}
      className="mb-3.5 scroll-mt-4 overflow-hidden rounded-xl border border-border bg-surface"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.25 text-foreground"
      >
        <Icon.Cpu size={15} className="text-subtle-foreground" aria-hidden />
        <span className="text-base font-semibold">{review.agent_name ?? t("runStatus.agentFallback")}</span>
        {review.verdict && (
          <Badge variant="ghost" className={verdictText}>
            {review.verdict.replace("_", " ")}
          </Badge>
        )}
        <div className="flex items-end gap-3">
          {criticalCount > 0 && <SeverityChip sev="CRITICAL" count={criticalCount} />}
          {warningCount > 0 && <SeverityChip sev="WARNING" count={warningCount} />}
          {suggestionCount > 0 && <SeverityChip sev="SUGGESTION" count={suggestionCount} />}
          {blockers > 0 && (
            <span className="pb-0.5 text-xs text-subtle-foreground">{t("reviewRun.blockers", { count: blockers })}</span>
          )}
        </div>
        <span className="flex-1" />
        {review.score != null && (
          <Badge variant="neutral" className="mono">
            {review.score}
          </Badge>
        )}
        <span className="mono text-xs text-subtle-foreground">
          {formatWhen(review.created_at)}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(t("reviewRun.deleteConfirm", { agent: review.agent_name ?? t("reviewRun.agentFallback") }))) {
              del.mutate(review.id);
            }
          }}
          disabled={del.isPending}
          title={t("reviewRun.deleteLabel")}
          aria-label={t("reviewRun.deleteLabel")}
          className="inline-flex cursor-pointer border-none bg-transparent p-1 text-subtle-foreground hover:text-crit disabled:cursor-not-allowed"
        >
          <Icon.Trash size={14} className={del.isPending ? "animate-dd-spin" : undefined} aria-hidden />
        </button>
        <Icon.ChevronDown
          size={16}
          aria-hidden
          className={cn("text-subtle-foreground transition-transform duration-150", open && "rotate-180")}
        />
      </div>

      {open && (
        <div className="px-4 pb-4">
          {review.verdict && (
            <div className="mb-4">
              <VerdictBanner
                verdict={review.verdict as Verdict}
                summary={review.summary}
                score={review.score}
                findingsCount={findings.length}
                blockers={blockers}
                agentName={review.agent_name}
              />
            </div>
          )}
          <FindingsPanel
            findings={findings}
            prId={prId}
            repoFullName={repoFullName}
            headSha={headSha}
            targetFindingId={targetFindingId}
            agentId={review.agent_id}
          />
        </div>
      )}
    </div>
  );
}

export default ReviewRunAccordion;
