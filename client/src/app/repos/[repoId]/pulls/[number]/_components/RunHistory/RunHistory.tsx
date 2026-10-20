"use client";

import { useTranslations } from "next-intl";
import { CircularScore } from "@/components/circular-score";
import { Icon, type IconName } from "@/components/icon";
import { RunCostBadge } from "@/components/run-cost-badge";
import { FindingsTooltip, SeverityCountBadges } from "@/components/findings-tooltip";
import { Badge } from "@/components/ui/badge";
import { countBySeverity } from "@/lib/findings";
import { cn } from "@/lib/utils";
import type { RunSummary, PrCommit, FindingRecord } from "@devdigest/shared";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Failed runs show their error
 * inline; clicking a run row opens its trace.
 *
 * The badge reflects the review OUTCOME, not just the run lifecycle: a finished
 * run that found blockers reads "rejected" (red), never a green "done". Outcome
 * is derived from the denormalized blocker/finding counts on the run row, so it
 * matches the CI gate (deterministic) rather than the model's verdict.
 */

type Outcome = { key: string; tone: "brand" | "neutral" | "crit" | "warn" | "ok"; icon: IconName };

function outcomeOf(run: RunSummary): Outcome {
  const status = run.status ?? "";
  if (status === "running") return { key: "running", tone: "brand", icon: "RefreshCw" };
  if (status === "queued") return { key: "queued", tone: "neutral", icon: "Clock" };
  if (status === "failed") return { key: "error", tone: "crit", icon: "XCircle" };
  if (status === "cancelled") return { key: "cancelled", tone: "neutral", icon: "X" };
  // Settled ("done"): color by the deterministic outcome.
  if ((run.blockers ?? 0) > 0) return { key: "rejected", tone: "crit", icon: "XCircle" };
  if ((run.findings_count ?? 0) > 0) return { key: "reviewed", tone: "warn", icon: "MessageSquare" };
  return { key: "approved", tone: "ok", icon: "CheckCircle" };
}

const ROW = "flex w-full items-center gap-3 rounded-lg px-3.5 text-left";

type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

export function RunHistory({
  runs,
  commits = [],
  findingsByRunId,
  repoId,
  prNumber,
  repoFullName,
  headSha,
  onOpenTrace,
  onGoToReview,
  onDelete,
  queuePositions,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  findingsByRunId?: Map<string, FindingRecord[]>;
  repoId?: string | null;
  prNumber?: number | null;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
  /** run_id -> 1-based queue position for `queued` rows (from usePrActiveRuns). */
  queuePositions?: Record<string, number | null | undefined>;
}) {
  const t = useTranslations("prReview");
  const tRuns = useTranslations("runs.multiAgent");
  if (runs.length === 0 && commits.length === 0) return null;

  const items: TimelineItem[] = [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({
      kind: "commit" as const,
      ts: tsOf(commit.committed_at),
      commit,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        if (item.kind === "commit") {
          const c = item.commit;
          // Commits are markers, not actions — dashed and transparent so they
          // read as separators between the runs they sit between.
          return (
            <div key={`commit:${c.sha}`} className={cn(ROW, "border border-dashed border-border py-2")}>
              <Icon.GitCommit size={15} className="shrink-0 text-subtle-foreground" aria-hidden />
              <span className="mono shrink-0 text-xs text-muted-foreground">{c.sha.slice(0, 7)}</span>
              <span className="min-w-0 flex-1 truncate text-ui text-muted-foreground" title={c.message}>
                {c.message.split("\n")[0]}
              </span>
              <span className="shrink-0 text-2xs text-subtle-foreground">{c.author}</span>
              {c.committed_at && (
                <span className="shrink-0 text-2xs text-subtle-foreground">
                  {new Date(c.committed_at).toLocaleTimeString()}
                </span>
              )}
            </div>
          );
        }

        const r = item.run;
        const o = outcomeOf(r);
        const OutcomeIcon = Icon[o.icon];
        const settled = r.status === "done";
        const runFindings = findingsByRunId?.get(r.run_id);
        return (
          <div key={`run:${r.run_id}`} className={cn(ROW, "border border-border bg-elevated py-2.5")}>
            <Badge variant={o.tone}>
              <OutcomeIcon aria-hidden />
              {o.key === "queued"
                ? queuePositions?.[r.run_id] != null
                  ? tRuns("columns.queued", { position: queuePositions[r.run_id] as number })
                  : tRuns("configure.recent.status.queued")
                : t(`runStatus.${o.key}`)}
            </Badge>
            {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="text-sm font-semibold text-foreground">
                <button
                  type="button"
                  onClick={() => onGoToReview?.(r.run_id)}
                  title={t("timeline.goToReview")}
                  className={cn(
                    "border-none bg-transparent p-0 font-semibold text-foreground underline-offset-3",
                    onGoToReview ? "cursor-pointer underline decoration-dotted" : "cursor-default",
                  )}
                >
                  {r.agent_name ?? t("runStatus.agentFallback")}
                </button>{" "}
                <span className="mono text-xs font-normal text-subtle-foreground">
                  {r.provider}/{r.model}
                </span>
              </div>
              {r.status === "failed" && r.error && (
                <div className="truncate text-xs text-crit" title={r.error}>
                  {r.error}
                </div>
              )}
              {settled && ((runFindings?.length ?? 0) > 0 || (r.blockers ?? 0) > 0) && (
                <div className="flex items-center gap-1.5 text-xs text-subtle-foreground">
                  {(runFindings?.length ?? 0) > 0 && (
                    <FindingsTooltip
                      trigger={<SeverityCountBadges counts={countBySeverity(runFindings!)} />}
                      findings={runFindings}
                      repoFullName={repoFullName}
                      headSha={headSha}
                      repoId={repoId}
                      prNumber={prNumber}
                    />
                  )}
                  {(r.blockers ?? 0) > 0 ? t("runStatus.blockers", { count: r.blockers ?? 0 }) : ""}
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5 text-2xs text-subtle-foreground">
              {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
              {settled && (
                <RunCostBadge variant="timeline" costUsd={r.cost_usd} tokensIn={r.tokens_in} tokensOut={r.tokens_out} />
              )}
            </div>
            <button
              type="button"
              title={t("timeline.openTrace")}
              aria-label={t("timeline.openTrace")}
              onClick={() => onOpenTrace(r.run_id)}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[5px] border border-border bg-surface p-1 text-subtle-foreground hover:text-foreground"
            >
              <Icon.FileText size={13} aria-hidden />
            </button>
            {onDelete && r.status !== "running" && (
              <span
                role="button"
                aria-label={t("timeline.deleteRun")}
                title={t("timeline.deleteRun")}
                onClick={() => onDelete(r.run_id)}
                className="inline-flex shrink-0 cursor-pointer rounded-[5px] p-0.75 text-subtle-foreground hover:text-crit"
              >
                <Icon.Trash size={13} aria-hidden />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
