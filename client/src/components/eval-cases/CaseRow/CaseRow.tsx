"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCaseListItem } from "@devdigest/shared";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { caseChip, summarizeCase } from "../helpers";
import { useCaseSummaryText } from "../useCaseSummaryText";

const WRAP = "min-w-0 break-words wrap-anywhere";

/** Kind badge tone: blue must-find, amber must-not-flag. */
const KIND_TONE: Record<EvalCaseListItem["kind"], string> = {
  must_find: "border-primary text-primary",
  must_not_flag: "border-warn text-warn",
};

/** One eval case: status icon (pass / fail / never run / errored), bold mono
 *  name, kind badge (blue must-find / amber must-not-flag, seed tooltip for
 *  finding-seeded cases), summary line, right chip and Run / Edit / Delete. */
export function CaseRow({
  c,
  onRun,
  onEdit,
  onDelete,
  runDisabledReason,
}: {
  c: EvalCaseListItem;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** When set, the row's Run button is disabled and exposes this reason. */
  runDisabledReason?: string;
}) {
  const t = useTranslations("eval");
  const reasonId = React.useId();
  const summaryToText = useCaseSummaryText();
  const run = c.last_run;
  const summary = summarizeCase(c.kind, c.expected_output, run);
  const chip = caseChip(c.kind, c.expected_output);
  const seedTip = c.source === "manual" ? undefined : t(`evalsTab.seed.${c.source}`);

  const statusKey = !run ? "never" : run.status === "errored" ? "errored" : run.pass ? "pass" : "fail";
  const StatusIcon = {
    pass: <Icon.CheckCircle size={18} className="text-ok" aria-hidden />,
    fail: <Icon.XCircle size={18} className="text-crit" aria-hidden />,
    errored: <Icon.AlertTriangle size={18} className="text-warn" aria-hidden />,
    never: <Icon.Dot size={18} className="text-subtle-foreground" aria-hidden />,
  }[statusKey];

  const summaryText = summaryToText(summary);

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5">
      <span
        className="grid w-5 shrink-0 place-items-center"
        role="img"
        aria-label={t(`evalsTab.status.${statusKey}`)}
        data-status={statusKey}
      >
        {StatusIcon}
      </span>
      {/* min-w-0 + wrapping so long names / file:line summaries never push the row wider (client/INSIGHTS.md 2026-09-24). */}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={cn("mono cursor-pointer text-base font-bold", WRAP)} onClick={onEdit}>
            {c.name}
          </span>
          <span
            data-kind={c.kind}
            className={cn(
              "shrink-0 rounded-sm border px-1.5 py-px text-[10.5px] font-bold tracking-[0.05em] whitespace-nowrap uppercase",
              KIND_TONE[c.kind],
            )}
            title={seedTip}
          >
            {t(`evalsTab.kind.${c.kind}`)}
          </span>
        </div>
        <div className={cn("mono mt-0.5 text-ui text-subtle-foreground", WRAP)}>{summaryText}</div>
      </div>
      {chip && (
        <span className="shrink-0 rounded-[5px] bg-muted px-2.25 py-0.75 text-xs whitespace-nowrap text-subtle-foreground">
          {chip.kind === "empty" ? t("evalsTab.assertEmpty") : chip.text}
        </span>
      )}
      <div className="flex shrink-0 gap-0.5">
        {runDisabledReason ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("evalsTab.run")}
              title={runDisabledReason}
              aria-describedby={reasonId}
              disabled
            >
              <Icon.Play aria-hidden />
            </Button>
            <span id={reasonId} className="sr-only">
              {runDisabledReason}
            </span>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("evalsTab.run")}
            title={t("evalsTab.run")}
            onClick={onRun}
          >
            <Icon.Play aria-hidden />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("evalsTab.edit")}
          title={t("evalsTab.edit")}
          onClick={onEdit}
        >
          <Icon.Edit aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="hover:text-crit"
          aria-label={t("evalsTab.delete")}
          title={t("evalsTab.delete")}
          onClick={onDelete}
        >
          <Icon.Trash aria-hidden />
        </Button>
      </div>
    </div>
  );
}
