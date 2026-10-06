"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { EvalCaseListItem, EvalOwnerKind } from "@devdigest/shared";
import { useDeleteEvalCase, useEvalCases, useEvalStats, useRunEvalCase } from "@/lib/hooks/eval-cases";
import { useAgentEvalRuns, useEvalSuiteRun, useStartAgentEvalRun } from "@/lib/hooks/eval-runs";
import { countPassing } from "@/lib/eval";
import { CaseRow } from "./_components/CaseRow";
import { EvalCaseEditorModal } from "./_components/EvalCaseEditorModal";
import { MetricTiles } from "./_components/MetricTiles";
import { s } from "./styles";

/** Evals tab — metrics from the agent's latest finished suite run (with point
 *  deltas), its eval cases with per-case Run/Edit/Delete, and "Run all evals",
 *  which starts a background suite run and polls its progress.
 *
 *  An agent owner runs versioned suite runs; a skill owner keeps the previous
 *  behaviour (optional `onRunAll` batch button, averaged rollup, no suite UI). */
export function EvalsTab({
  ownerKind,
  ownerId,
  onRunAll,
  runAllPending,
}: {
  ownerKind: EvalOwnerKind;
  ownerId: string;
  onRunAll?: () => void;
  runAllPending?: boolean;
}) {
  const t = useTranslations("eval");
  const isAgent = ownerKind === "agent";
  const agentId = isAgent ? ownerId : null;

  const { data: stats } = useEvalStats(ownerKind, ownerId);
  const { data: cases, isLoading, isError, refetch } = useEvalCases(ownerKind, ownerId);
  const runCase = useRunEvalCase();
  const deleteCase = useDeleteEvalCase();
  const [editing, setEditing] = React.useState<EvalCaseListItem | "new" | null>(null);

  // Suite run: the one started here, else (after a reload) the newest run the
  // server still reports as running.
  const startRun = useStartAgentEvalRun();
  const [startedRunId, setStartedRunId] = React.useState<string | null>(null);
  const history = useAgentEvalRuns(agentId, "all");
  const serverRunningId = history.data?.runs.find((r) => r.status === "running")?.id ?? null;
  const activeRunId = startedRunId ?? serverRunningId;
  const suite = useEvalSuiteRun(activeRunId, agentId);
  const suiteRunning = startRun.isPending || suite.data?.status === "running" || (!!serverRunningId && !suite.data);

  const caseList = (cases ?? []) as EvalCaseListItem[];
  const { passing, withResult } = countPassing(caseList);

  const handleRunAll = () => {
    if (!agentId) return;
    startRun.mutate(agentId, { onSuccess: (r) => setStartedRunId(r.run_id) });
  };

  const runAllLabel = suiteRunning
    ? t("evalsTab.runningProgress", { done: suite.data?.cases_done ?? 0, total: suite.data?.cases_total ?? caseList.length })
    : t("evalsTab.runAllCount", { count: caseList.length });

  return (
    <div style={s.wrap}>
      {editing && (
        <EvalCaseEditorModal
          ownerKind={ownerKind}
          ownerId={ownerId}
          initialCase={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <div>
        <div style={s.metricsHeader}>
          <span style={s.metricsLabel}>
            <Icon.Gauge size={14} />
            {t("evalsTab.metricsLabel")}
          </span>
          {isAgent && (
            <Link href={`/eval/${ownerId}`} className="mono" style={s.dashLink}>
              {t("evalsTab.viewDashboard")}
            </Link>
          )}
        </div>
        <MetricTiles stats={stats} />
        <div style={s.note}>
          <Icon.Code size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{t("evalsTab.scoringNote")}</span>
        </div>
      </div>

      <div>
        <div style={s.header}>
          <div style={s.sectionTitle}>{t("evalsTab.casesHeading")}</div>
          {withResult > 0 && (
            <span style={s.chip(passing === withResult ? "var(--ok)" : "var(--warn)")}>
              {t("evalsTab.passingChip", { passing, withResult })}
            </span>
          )}
          <span style={s.chip("var(--text-muted)")}>{t("evalsTab.totalChip", { count: caseList.length })}</span>
          <div style={s.headerActions}>
            {isAgent ? (
              <Button kind="secondary" size="sm" icon="Play" onClick={handleRunAll} disabled={suiteRunning || caseList.length === 0}>
                {runAllLabel}
              </Button>
            ) : (
              onRunAll && (
                <Button kind="secondary" size="sm" icon="Play" onClick={onRunAll} disabled={runAllPending}>
                  {runAllPending ? t("evalsTab.running") : t("evalsTab.runAll")}
                </Button>
              )
            )}
            <Button kind="primary" size="sm" icon="Plus" onClick={() => setEditing("new")}>
              {t("evalsTab.newCaseButton")}
            </Button>
          </div>
        </div>

        {isLoading && <Skeleton height={120} />}
        {isError && <ErrorState body={t("dashboard.loading")} onRetry={() => refetch()} />}
        {!isLoading && !isError && caseList.length === 0 && (
          <EmptyState icon="FlaskConical" title={t("evalsTab.casesHeading")} body={t("evalsTab.emptyCases")} />
        )}

        {caseList.length > 0 && (
          <div style={s.list}>
            {caseList.map((c) => (
              <CaseRow
                key={c.id}
                c={c}
                onRun={() => runCase.mutate({ id: c.id, ownerKind, ownerId })}
                onEdit={() => setEditing(c)}
                onDelete={() => {
                  if (window.confirm(`Delete eval case "${c.name}"? This cannot be undone.`)) {
                    deleteCase.mutate({ id: c.id, ownerKind, ownerId });
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
