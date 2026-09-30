"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
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
    <div style={s.wrap}>
      {indexReason && (
        <div role="alert" style={s.banner}>
          <div style={s.title}>
            <Icon.AlertTriangle size={14} />
            {t("index.title")}
          </div>
          <div style={s.body}>{t(`index.reason.${indexReason}`)}</div>
          <div style={s.remedy}>{t("index.remedy")}</div>
        </div>
      )}
      {modelReason && (
        <div role="alert" style={s.banner}>
          <div style={s.title}>
            <Icon.AlertTriangle size={14} />
            {t("model.title")}
          </div>
          <div style={s.body}>{t(`model.reason.${modelReason}`)}</div>
          <div style={s.remedy}>{t("model.remedy")}</div>
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 } as React.CSSProperties,
  banner: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } as React.CSSProperties,
  title: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    fontWeight: 700,
    color: "var(--warn)",
    marginBottom: 4,
  } as React.CSSProperties,
  body: { fontSize: 13, color: "var(--text-secondary)" } as React.CSSProperties,
  remedy: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 } as React.CSSProperties,
};

export default DegradedBanner;
