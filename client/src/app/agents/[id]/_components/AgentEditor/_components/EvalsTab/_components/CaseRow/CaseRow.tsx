"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, IconBtn } from "@devdigest/ui";
import type { EvalCaseListItem } from "@devdigest/shared";
import { caseChip, summarizeCase } from "../../helpers";
import { s } from "../../styles";

/** One eval case: status icon (pass / fail / never run / errored), bold mono
 *  name, kind badge (blue must-find / amber must-not-flag, seed tooltip for
 *  finding-seeded cases), summary line, right chip and Run / Edit / Delete. */
export function CaseRow({
  c,
  onRun,
  onEdit,
  onDelete,
}: {
  c: EvalCaseListItem;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval");
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

  const summaryText =
    summary.kind === "neverRun"
      ? t("evalsTab.summary.neverRun")
      : summary.kind === "errored"
        ? t("evalsTab.summary.errored", { message: summary.message })
        : summary.kind === "mustFind"
          ? t("evalsTab.summary.mustFind", { expected: summary.expected, got: summary.got })
          : summary.locations
            ? t("evalsTab.summary.mustNotFlagAt", { locations: summary.locations, got: summary.got })
            : t("evalsTab.summary.mustNotFlag", { got: summary.got });

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
      {chip && <span style={s.rowChip}>{chip.kind === "assertEmpty" ? t("evalsTab.assertEmpty") : chip.text}</span>}
      <div style={s.rowActions}>
        <IconBtn icon="Play" label={t("evalsTab.run")} onClick={onRun} />
        <IconBtn icon="Edit" label={t("evalsTab.edit")} onClick={onEdit} />
        <IconBtn icon="Trash" label={t("evalsTab.delete")} danger onClick={onDelete} />
      </div>
    </div>
  );
}
