"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, IconBtn, MetricCard, Skeleton } from "@devdigest/ui";
import type { EvalCaseListItem, EvalOwnerKind } from "@devdigest/shared";
import { useDeleteEvalCase, useEvalCases, useEvalStats, useRunEvalCase } from "../../../../../../../lib/hooks/eval-cases";
import { EvalCaseEditorModal } from "./_components/EvalCaseEditorModal";
import { s } from "./styles";

/** Evals tab — a metrics rollup plus this owner's (agent or skill) eval cases
 *  with per-case Run/Edit/Delete. An agent owner has no batch action here
 *  (that's the global Eval Dashboard's job); a skill owner gets an optional
 *  "Run all evals" button via `onRunAll` (there's no per-skill dashboard). */
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
  const { data: stats } = useEvalStats(ownerKind, ownerId);
  const { data: cases, isLoading, isError, refetch } = useEvalCases(ownerKind, ownerId);
  const runCase = useRunEvalCase();
  const deleteCase = useDeleteEvalCase();
  const [editing, setEditing] = React.useState<EvalCaseListItem | "new" | null>(null);

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
        <div style={s.sectionTitle}>{t("evalsTab.metricsTitle")}</div>
        <div style={s.subtitle}>{t("evalsTab.metricsSubtitle")}</div>
        <div style={{ ...s.tileRow, marginTop: 12 }}>
          <MetricCard
            label={t("dashboard.metrics.recall")}
            value={stats?.recall != null ? Math.round(stats.recall * 100) : "—"}
            suffix={stats?.recall != null ? "%" : undefined}
          />
          <MetricCard
            label={t("dashboard.metrics.precision")}
            value={stats?.precision != null ? Math.round(stats.precision * 100) : "—"}
            suffix={stats?.precision != null ? "%" : undefined}
          />
          <MetricCard
            label={t("dashboard.metrics.citationAccuracy")}
            value={stats?.citation_accuracy != null ? Math.round(stats.citation_accuracy * 100) : "—"}
            suffix={stats?.citation_accuracy != null ? "%" : undefined}
          />
        </div>
      </div>

      <div>
        <div style={s.header}>
          <div style={s.sectionTitle}>{t("evalsTab.casesHeading")}</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {onRunAll && (
              <Button kind="secondary" size="sm" icon="Play" onClick={onRunAll} disabled={runAllPending}>
                {runAllPending ? t("evalsTab.running") : t("evalsTab.runAll")}
              </Button>
            )}
            <Button kind="primary" size="sm" icon="Plus" onClick={() => setEditing("new")}>
              {t("evalsTab.newCase")}
            </Button>
          </div>
        </div>

        {isLoading && <Skeleton height={120} />}
        {isError && <ErrorState body={t("dashboard.loading")} onRetry={() => refetch()} />}
        {!isLoading && !isError && (cases ?? []).length === 0 && (
          <EmptyState icon="FlaskConical" title={t("evalsTab.casesHeading")} body={t("evalsTab.emptyCases")} />
        )}

        {(cases ?? []).length > 0 && (
          <div style={s.list}>
            {(cases as EvalCaseListItem[]).map((c) => (
              <div key={c.id} style={s.row}>
                <span style={s.rowName} onClick={() => setEditing(c)}>
                  {c.name}
                </span>
                <span style={s.rowMeta}>
                  {c.last_run == null
                    ? t("evalsTab.neverRun")
                    : `${c.last_run.pass ? t("evalsTab.passed") : t("evalsTab.failed")}${
                        c.last_run.recall != null
                          ? t("evalsTab.recallSuffix", { recall: Math.round(c.last_run.recall * 100) })
                          : ""
                      }`}
                </span>
                {c.last_run && (
                  <Badge color={c.last_run.pass ? "var(--ok)" : "var(--crit)"}>
                    {c.last_run.pass ? t("dashboard.pass") : t("dashboard.fail")}
                  </Badge>
                )}
                <div style={s.rowActions}>
                  <IconBtn
                    icon="Play"
                    label={runCase.isPending ? t("evalsTab.running") : t("evalsTab.run")}
                    onClick={() => runCase.mutate({ id: c.id, ownerKind, ownerId })}
                  />
                  <IconBtn icon="Edit" label={t("evalsTab.edit")} onClick={() => setEditing(c)} />
                  <IconBtn
                    icon="Trash"
                    label={t("evalsTab.delete")}
                    danger
                    onClick={() => {
                      if (window.confirm(`Delete eval case "${c.name}"? This cannot be undone.`)) {
                        deleteCase.mutate({ id: c.id, ownerKind, ownerId });
                      }
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
