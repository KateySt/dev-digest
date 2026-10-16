"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { useAgent } from "@/lib/hooks/agents";
import { useEvalCases, useEvalStats } from "@/lib/hooks/eval-cases";
import { useAgentEvalRuns, useEvalSuiteRun, useStartAgentEvalRun } from "@/lib/hooks/eval-runs";
import { EvalCaseList, MetricTiles, type RunAllControl } from "@/components/eval-cases";

/** Agent Editor's Evals tab — metrics from the agent's latest finished suite
 *  run (with point deltas), then the shared case list. "Run all evals" starts a
 *  background suite run and polls its progress. */
export function EvalsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const { data: agent } = useAgent(agentId);
  const { data: stats } = useEvalStats("agent", agentId);
  const { data: cases } = useEvalCases("agent", agentId);

  // Suite run: the one started here, else (after a reload) the newest run the
  // server still reports as running.
  const startRun = useStartAgentEvalRun();
  const [startedRunId, setStartedRunId] = React.useState<string | null>(null);
  const history = useAgentEvalRuns(agentId, "all");
  const serverRunningId = history.data?.runs.find((r) => r.status === "running")?.id ?? null;
  const activeRunId = startedRunId ?? serverRunningId;
  const suite = useEvalSuiteRun(activeRunId, { kind: "agent", id: agentId });
  const suiteRunning = startRun.isPending || suite.data?.status === "running" || (!!serverRunningId && !suite.data);

  const caseCount = cases?.length ?? 0;

  const runAll: RunAllControl = {
    label: suiteRunning
      ? t("evalsTab.runningProgress", { done: suite.data?.cases_done ?? 0, total: suite.data?.cases_total ?? caseCount })
      : t("evalsTab.runAllCount", { count: caseCount }),
    disabled: suiteRunning || caseCount === 0,
    disabledReason: suiteRunning ? t("evalsTab.reason.running") : caseCount === 0 ? t("evalsTab.reason.noCases") : undefined,
    onClick: () => startRun.mutate(agentId, { onSuccess: (r) => setStartedRunId(r.run_id) }),
  };

  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex items-center gap-2 text-xs font-bold tracking-[0.06em] text-subtle-foreground uppercase">
            <Icon.Gauge size={14} aria-hidden />
            {t("evalsTab.metricsLabel")}
          </span>
          <Link
            href={`/eval/${agentId}`}
            className="mono ml-auto text-ui text-muted-foreground no-underline hover:text-foreground"
          >
            {t("evalsTab.viewDashboard")}
          </Link>
        </div>
        <MetricTiles stats={stats} />
        <div className="mt-3 flex items-start gap-2 text-xs text-subtle-foreground">
          <Icon.Code size={14} className="mt-px shrink-0" aria-hidden />
          <span>{t("evalsTab.scoringNote")}</span>
        </div>
      </div>

      <EvalCaseList ownerKind="agent" ownerId={agentId} ownerName={agent?.name ?? ""} runAll={runAll} />
    </div>
  );
}
