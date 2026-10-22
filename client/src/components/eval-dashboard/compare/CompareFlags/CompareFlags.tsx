"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { WRAP } from "../../constants";

const FLAG = cn("rounded-md border border-warn px-2.5 py-0.75 text-ui text-warn", WRAP);

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
    <div className="flex flex-wrap gap-2.5">
      {caseSetsDiffer && (
        <span className={FLAG}>
          {t("compare.caseSetsDiffer", { old: caseSetsDiffer.old_count, new: caseSetsDiffer.new_count })}
        </span>
      )}
      {editedCases > 0 && <span className={FLAG}>{t("compare.editedCases", { count: editedCases })}</span>}
    </div>
  );
}
