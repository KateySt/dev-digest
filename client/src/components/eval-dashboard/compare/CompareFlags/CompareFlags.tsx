"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "../../styles";

/** "case sets differ (X vs Y)" / "N cases edited between runs" — renders
 *  nothing when the runs are directly comparable. */
export function CompareFlags({
  caseSetsDiffer,
  editedCases,
}: {
  caseSetsDiffer: { old_count: number; new_count: number } | null;
  editedCases: number;
}) {
  const t = useTranslations("evalMetrics");
  if (!caseSetsDiffer && editedCases <= 0) return null;
  return (
    <div style={s.flags}>
      {caseSetsDiffer && (
        <span style={s.flag}>
          {t("compare.caseSetsDiffer", { old: caseSetsDiffer.old_count, new: caseSetsDiffer.new_count })}
        </span>
      )}
      {editedCases > 0 && <span style={s.flag}>{t("compare.editedCases", { count: editedCases })}</span>}
    </div>
  );
}
