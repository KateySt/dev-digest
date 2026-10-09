"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { EvalCaseListItem, EvalOwnerKind } from "@devdigest/shared";
import { useDeleteEvalCase, useEvalCases, useRunEvalCase } from "@/lib/hooks/eval-cases";
import { countPassing } from "@/lib/eval";
import { CaseRow } from "../CaseRow";
import { EvalCaseEditorModal } from "../EvalCaseEditorModal";
import { s } from "../styles";

/** The "Run all evals" button, described by the owner-specific caller so this
 *  list never needs to know whether it belongs to an agent or a skill. */
export interface RunAllControl {
  label: string;
  disabled: boolean;
  /** Why the button is disabled (tooltip + aria-describedby); omit when enabled. */
  disabledReason?: string;
  onClick: () => void;
}

/** Cases header ("N / M passing" chip, total chip, Run all, + New eval case),
 *  the case rows with per-row Run / Edit / Delete, the empty state, and the
 *  Case Editor modal. Owner-agnostic: the caller supplies the run-all control
 *  and the (optional) reason per-row Run is disabled. */
export function EvalCaseList({
  ownerKind,
  ownerId,
  ownerName,
  runAll,
  rowRunDisabledReason,
}: {
  ownerKind: EvalOwnerKind;
  ownerId: string;
  ownerName: string;
  runAll: RunAllControl;
  rowRunDisabledReason?: string;
}) {
  const t = useTranslations("eval");
  const reasonId = React.useId();
  const { data: cases, isLoading, isError, refetch } = useEvalCases(ownerKind, ownerId);
  const runCase = useRunEvalCase();
  const deleteCase = useDeleteEvalCase();
  const [editing, setEditing] = React.useState<EvalCaseListItem | "new" | null>(null);

  const caseList = (cases ?? []) as EvalCaseListItem[];
  const { passing, withResult } = countPassing(caseList);
  const runAllReason = runAll.disabled ? runAll.disabledReason : undefined;

  return (
    <div>
      {editing && (
        <EvalCaseEditorModal
          ownerKind={ownerKind}
          ownerId={ownerId}
          ownerName={ownerName}
          initialCase={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <div style={s.header}>
        <div style={s.sectionTitle}>{t("evalsTab.casesHeading")}</div>
        {withResult > 0 && (
          <span style={s.chip(passing === withResult ? "var(--ok)" : "var(--warn)")}>
            {t("evalsTab.passingChip", { passing, withResult })}
          </span>
        )}
        <span style={s.chip("var(--text-muted)")}>{t("evalsTab.totalChip", { count: caseList.length })}</span>
        <div style={s.headerActions}>
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            onClick={runAll.onClick}
            disabled={runAll.disabled}
            title={runAllReason}
            aria-describedby={runAllReason ? reasonId : undefined}
          >
            {runAll.label}
          </Button>
          {runAllReason && (
            <span id={reasonId} style={s.srOnly}>
              {runAllReason}
            </span>
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
              runDisabledReason={rowRunDisabledReason}
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
  );
}
