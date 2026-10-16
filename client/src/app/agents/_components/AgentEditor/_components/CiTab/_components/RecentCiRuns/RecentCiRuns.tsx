"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CiRun } from "@devdigest/shared";
import { ciStatusBadge, ingestErrorMessage, isKnownCiStatus } from "@/lib/ci-status";
import { fullRelativeTime } from "@/app/repos/[repoId]/pulls/helpers";
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";

/** The agent's most recent CI runs. Trace opens the existing run-trace drawer;
 *  a failed ingest shows its error instead (no linked run, no Trace). */
export function RecentCiRuns({ runs, agentName }: { runs: CiRun[]; agentName: string }) {
  const t = useTranslations("ci");
  const [traceRun, setTraceRun] = React.useState<CiRun | null>(null);
  const ingestErrorLabel = (raw: string) => {
    const m = ingestErrorMessage(raw);
    return m ? t(m.key, m.values) : raw;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-semibold text-muted-foreground">{t("ciTab.recentRuns.title")}</div>
      {runs.length === 0 ? (
        <div className="text-sm text-subtle-foreground">{t("ciTab.recentRuns.empty")}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {runs.map((run) => {
            const tone = ciStatusBadge(run.status);
            return (
              <div
                key={run.id}
                className="flex min-w-0 flex-wrap items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2"
              >
                <Badge variant={tone.variant}>
                  <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
                  {isKnownCiStatus(run.status) ? t(`runs.status.${run.status}`) : (run.status ?? "-")}
                </Badge>
                <span className="mono min-w-0 flex-1 text-ui wrap-anywhere">
                  {run.repo ?? "-"}
                  {run.pr_number != null ? ` #${run.pr_number}` : ""}
                </span>
                {run.ingest_error && <span className="text-xs text-crit wrap-anywhere">{ingestErrorLabel(run.ingest_error)}</span>}
                <span className="text-ui whitespace-nowrap text-subtle-foreground">{run.ran_at ? fullRelativeTime(run.ran_at) : ""}</span>
                {run.agent_run_id && (
                  <Button size="sm" variant="outline" onClick={() => setTraceRun(run)}>
                    {t("ciTab.recentRuns.trace")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {traceRun?.agent_run_id && (
        <RunTraceDrawer
          runId={traceRun.agent_run_id}
          agentName={agentName}
          prNumber={traceRun.pr_number}
          onClose={() => setTraceRun(null)}
        />
      )}
    </div>
  );
}
