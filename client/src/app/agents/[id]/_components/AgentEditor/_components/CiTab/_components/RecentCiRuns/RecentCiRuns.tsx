"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { ciStatusTone, ingestErrorMessage, isKnownCiStatus } from "@/lib/ci-status";
import { fullRelativeTime } from "@/app/repos/[repoId]/pulls/helpers";
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import { s } from "./styles";

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
    <div style={s.wrap}>
      <div style={s.title}>{t("ciTab.recentRuns.title")}</div>
      {runs.length === 0 ? (
        <div style={s.empty}>{t("ciTab.recentRuns.empty")}</div>
      ) : (
        <div style={s.list}>
          {runs.map((run) => {
            const tone = ciStatusTone(run.status);
            return (
              <div key={run.id} style={s.row}>
                <Badge color={tone.color} bg={tone.bg} dot>
                  {isKnownCiStatus(run.status) ? t(`runs.status.${run.status}`) : (run.status ?? "-")}
                </Badge>
                <span className="mono" style={s.pr}>
                  {run.repo ?? "-"}
                  {run.pr_number != null ? ` #${run.pr_number}` : ""}
                </span>
                {run.ingest_error && <span style={s.error}>{ingestErrorLabel(run.ingest_error)}</span>}
                <span style={s.meta}>{run.ran_at ? fullRelativeTime(run.ran_at) : ""}</span>
                {run.agent_run_id && (
                  <Button size="sm" kind="ghost" onClick={() => setTraceRun(run)}>
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
