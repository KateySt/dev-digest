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
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useIntent } from "@/lib/hooks/reviews";

const listLabel = (tone: string) =>
  cn("mb-1 flex items-center gap-1.25 text-xs font-semibold tracking-[0.04em] uppercase", tone);

export function IntentPanel({ prId }: { prId: string | null | undefined }) {
  const t = useTranslations("brief");
  const { data: intent, isLoading } = useIntent(prId);

  if (isLoading) return null;

  if (!intent) {
    return <EmptyState icon="Target" title={t("unavailable")} body={t("unavailableHint")} />;
  }

  return (
    // Layout only: the parent card (OverviewTab) owns the border.
    <div className="flex flex-col gap-3.5">
      {/* Wraps so the long low-confidence badge drops onto its own full-width
          row instead of squeezing the intent text into a one-word column. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="m-0 flex-[1_1_260px] text-base leading-[1.55] text-foreground italic">{intent.intent}</p>
        {intent.confidence === "low" && (
          <Badge variant="warn" className="flex-[1_1_100%] justify-start text-left whitespace-normal">
            <Icon.AlertTriangle aria-hidden />
            {t("intent.lowConfidence")}
          </Badge>
        )}
      </div>

      {intent.in_scope.length > 0 && (
        <div>
          <div className={listLabel("text-ok")}>
            <Icon.Check size={12} aria-hidden />
            {t("intent.inScope")}
          </div>
          <ul className="m-0 pl-4.5 text-sm leading-[1.6] text-muted-foreground">
            {intent.in_scope.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {intent.out_of_scope.length > 0 && (
        <div>
          <div className={listLabel("text-crit")}>
            <Icon.X size={12} aria-hidden />
            {t("intent.outOfScope")}
          </div>
          <ul className="m-0 pl-4.5 text-sm leading-[1.6] text-muted-foreground">
            {intent.out_of_scope.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {intent.spec_ref && (
        <div className="mono text-xs text-subtle-foreground">{t("intent.specRef", { path: intent.spec_ref })}</div>
      )}
    </div>
  );
}
