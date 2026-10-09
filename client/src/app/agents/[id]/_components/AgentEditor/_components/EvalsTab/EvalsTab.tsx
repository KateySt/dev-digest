"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { useAgent } from "@/lib/hooks/agents";
import { useEvalCases, useEvalStats } from "@/lib/hooks/eval-cases";
import { useAgentEvalRuns, useEvalSuiteRun, useStartAgentEvalRun } from "@/lib/hooks/eval-runs";
import { EvalCaseList, MetricTiles, type RunAllControl } from "@/components/eval-cases";
import { s } from "./styles";

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
    <div style={s.wrap}>
      <div>
        <div style={s.metricsHeader}>
          <span style={s.metricsLabel}>
            <Icon.Gauge size={14} />
            {t("evalsTab.metricsLabel")}
          </span>
          <Link href={`/eval/${agentId}`} className="mono" style={s.dashLink}>
            {t("evalsTab.viewDashboard")}
          </Link>
        </div>
        <MetricTiles stats={stats} />
        <div style={s.note}>
          <Icon.Code size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{t("evalsTab.scoringNote")}</span>
        </div>
      </div>

      <EvalCaseList ownerKind="agent" ownerId={agentId} ownerName={agent?.name ?? ""} runAll={runAll} />
    </div>
  );
}
