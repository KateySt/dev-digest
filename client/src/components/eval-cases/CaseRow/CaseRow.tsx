"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, IconBtn } from "@devdigest/ui";
import type { EvalCaseListItem } from "@devdigest/shared";
import { caseChip, summarizeCase } from "../helpers";
import { useCaseSummaryText } from "../useCaseSummaryText";
import { s } from "../styles";

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
  const kindColor = c.kind === "must_find" ? "var(--accent)" : "var(--warn)";
  const seedTip = c.source === "manual" ? undefined : t(`evalsTab.seed.${c.source}`);

  const statusKey = !run ? "never" : run.status === "errored" ? "errored" : run.pass ? "pass" : "fail";
  const StatusIcon = {
    pass: <Icon.CheckCircle size={18} style={{ color: "var(--ok)" }} />,
    fail: <Icon.XCircle size={18} style={{ color: "var(--crit)" }} />,
    errored: <Icon.AlertTriangle size={18} style={{ color: "var(--warn)" }} />,
    never: <Icon.Dot size={18} style={{ color: "var(--text-muted)" }} />,
  }[statusKey];

  const summaryText = summaryToText(summary);

  return (
    <div style={s.row}>
      <span style={s.rowIcon} role="img" aria-label={t(`evalsTab.status.${statusKey}`)}>
        {StatusIcon}
      </span>
      <div style={s.rowMain}>
        <div style={s.rowTitleLine}>
          <span className="mono" style={s.rowName} onClick={onEdit}>
            {c.name}
          </span>
          <span style={s.kindBadge(kindColor)} title={seedTip}>
            {t(`evalsTab.kind.${c.kind}`)}
          </span>
        </div>
        <div className="mono" style={s.rowSummary}>
          {summaryText}
        </div>
      </div>
      {chip && <span style={s.rowChip}>{chip.kind === "empty" ? t("evalsTab.assertEmpty") : chip.text}</span>}
      <div style={s.rowActions}>
        {runDisabledReason ? (
          <>
            <Button
              kind="tertiary"
              size="sm"
              icon="Play"
              aria-label={t("evalsTab.run")}
              title={runDisabledReason}
              aria-describedby={reasonId}
              disabled
            />
            <span id={reasonId} style={s.srOnly}>
              {runDisabledReason}
            </span>
          </>
        ) : (
          <IconBtn icon="Play" label={t("evalsTab.run")} onClick={onRun} />
        )}
        <IconBtn icon="Edit" label={t("evalsTab.edit")} onClick={onEdit} />
        <IconBtn icon="Trash" label={t("evalsTab.delete")} danger onClick={onDelete} />
      </div>
    </div>
  );
}
