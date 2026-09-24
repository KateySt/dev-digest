/* IntentPanel — the body of the derived-intent block on the PR Overview tab.
   Rendered inside the merged Intent + Risk Areas `Card` owned by
   OverviewTab.tsx (that parent owns the single border and both section
   headers, so this component renders content only — no outer border/section
   of its own, or the card would get a doubled-up border). Computed
   server-side by a separate cheap model (Settings-selectable); this panel
   just renders it, with a visible (not tooltip-hidden) low-confidence
   indicator and a spec-ref note when the intent was partly derived from a
   same-repo spec/plan doc. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, Icon } from "@devdigest/ui";
import { useIntent } from "@/lib/hooks/reviews";
import { s } from "./styles";

export function IntentPanel({ prId }: { prId: string | null | undefined }) {
  const t = useTranslations("brief");
  const { data: intent, isLoading } = useIntent(prId);

  if (isLoading) return null;

  if (!intent) {
    return <EmptyState icon="Target" title={t("unavailable")} body={t("unavailableHint")} />;
  }

  return (
    <div style={s.content}>
      <div style={s.headRow}>
        <p style={s.intentText}>{intent.intent}</p>
        {intent.confidence === "low" && (
          <Badge
            color="var(--warn)"
            bg="var(--warn-bg)"
            icon="AlertTriangle"
            style={s.lowConfidenceBadge}
          >
            {t("intent.lowConfidence")}
          </Badge>
        )}
      </div>

      {intent.in_scope.length > 0 && (
        <div>
          <div style={s.listLabel(true)}>
            <Icon.Check size={12} />
            {t("intent.inScope")}
          </div>
          <ul style={s.list}>
            {intent.in_scope.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {intent.out_of_scope.length > 0 && (
        <div>
          <div style={s.listLabel(false)}>
            <Icon.X size={12} />
            {t("intent.outOfScope")}
          </div>
          <ul style={s.list}>
            {intent.out_of_scope.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {intent.spec_ref && (
        <div style={s.specNote}>{t("intent.specRef", { path: intent.spec_ref })}</div>
      )}
    </div>
  );
}
