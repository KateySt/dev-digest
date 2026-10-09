"use client";

import { useTranslations } from "next-intl";
import type { CaseSummary } from "./helpers";

/** Renders a `CaseSummary` as its one-line i18n text ("expected 1 finding, got 1",
 *  "never run", …) — shared by case rows, the Case Editor banner and Draft results. */
export function useCaseSummaryText(): (summary: CaseSummary) => string {
  const t = useTranslations("eval");
  return (summary) =>
    summary.kind === "neverRun"
      ? t("evalsTab.summary.neverRun")
      : summary.kind === "errored"
        ? t("evalsTab.summary.errored", { message: summary.message })
        : summary.kind === "mustFind"
          ? t("evalsTab.summary.mustFind", { expected: summary.expected, got: summary.got })
          : summary.locations
            ? t("evalsTab.summary.mustNotFlagAt", { locations: summary.locations, got: summary.got })
            : t("evalsTab.summary.mustNotFlag", { got: summary.got });
}
