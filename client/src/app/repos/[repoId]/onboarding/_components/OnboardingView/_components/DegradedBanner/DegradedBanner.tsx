"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import type { OnboardingIndexDegradedReason, OnboardingModelFailureReason } from "@/lib/types";

/**
 * C-AC-26 — reads the two INDEPENDENT reason fields from the shared
 * contract and renders a distinct banner per reason, BOTH at once when both
 * are set (never collapsed into one generic message, never one suppressing
 * the other). Coexists with per-section empty states (C-AC-18) rather than
 * either suppressing the other.
 */
export function DegradedBanner({
  indexReason,
  modelReason,
}: {
  indexReason: OnboardingIndexDegradedReason | null | undefined;
  modelReason: OnboardingModelFailureReason | null | undefined;
}) {
  const t = useTranslations("onboarding.degraded");
  if (!indexReason && !modelReason) return null;

  return (
    <div className="mb-4.5 flex flex-col gap-2.5">
      {indexReason && (
        <div role="alert" className="rounded-lg border border-warn bg-warn-bg px-3.5 py-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-warn">
            <Icon.AlertTriangle size={14} aria-hidden />
            {t("index.title")}
          </div>
          <div className="text-sm text-muted-foreground">{t(`index.reason.${indexReason}`)}</div>
          <div className="mt-1 text-ui text-subtle-foreground">{t("index.remedy")}</div>
        </div>
      )}
      {modelReason && (
        <div role="alert" className="rounded-lg border border-warn bg-warn-bg px-3.5 py-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-warn">
            <Icon.AlertTriangle size={14} aria-hidden />
            {t("model.title")}
          </div>
          <div className="text-sm text-muted-foreground">{t(`model.reason.${modelReason}`)}</div>
          <div className="mt-1 text-ui text-subtle-foreground">{t("model.remedy")}</div>
        </div>
      )}
    </div>
  );
}

export default DegradedBanner;
