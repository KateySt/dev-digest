"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { EvalCaseListItem, EvalOwnerKind } from "@devdigest/shared";
import { useDeleteEvalCase, useEvalCases, useRunEvalCase } from "@/lib/hooks/eval-cases";
import { countPassing } from "@/lib/eval";
import { cn } from "@/lib/utils";
import { CaseRow } from "../CaseRow";
import { EvalCaseEditorModal } from "../EvalCaseEditorModal";

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
const CHIP = "shrink-0 rounded-[5px] bg-muted px-2.25 py-0.5 text-xs font-semibold";

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

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="text-lg font-bold">{t("evalsTab.casesHeading")}</div>
        {withResult > 0 && (
          <span className={cn(CHIP, passing === withResult ? "text-ok" : "text-warn")}>
            {t("evalsTab.passingChip", { passing, withResult })}
          </span>
        )}
        <span className={cn(CHIP, "text-subtle-foreground")}>
          {t("evalsTab.totalChip", { count: caseList.length })}
        </span>
        <div className="ml-auto flex shrink-0 gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={runAll.onClick}
            disabled={runAll.disabled}
            title={runAllReason}
            aria-describedby={runAllReason ? reasonId : undefined}
          >
            <Icon.Play aria-hidden />
            {runAll.label}
          </Button>
          {runAllReason && (
            <span id={reasonId} className="sr-only">
              {runAllReason}
            </span>
          )}
          <Button size="sm" onClick={() => setEditing("new")}>
            <Icon.Plus aria-hidden />
            {t("evalsTab.newCaseButton")}
          </Button>
        </div>
      </div>

      {isLoading && <Skeleton className="h-30 w-full" />}
      {isError && <ErrorState body={t("dashboard.loading")} onRetry={() => refetch()} />}
      {!isLoading && !isError && caseList.length === 0 && (
        <EmptyState icon="FlaskConical" title={t("evalsTab.casesHeading")} body={t("evalsTab.emptyCases")} />
      )}

      {caseList.length > 0 && (
        <div className="flex flex-col gap-2">
          {caseList.map((c) => (
            <CaseRow
              key={c.id}
              c={c}
              runDisabledReason={rowRunDisabledReason}
              onRun={() => runCase.mutate({ id: c.id, ownerKind, ownerId })}
              onEdit={() => setEditing(c)}
              onDelete={() => {
                if (window.confirm(t("evalsTab.confirmDelete", { name: c.name }))) {
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
