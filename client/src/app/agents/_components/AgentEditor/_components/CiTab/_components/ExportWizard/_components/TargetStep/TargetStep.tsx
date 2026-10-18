"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TARGETS } from "../../constants";

const ERROR = "text-sm text-crit wrap-anywhere";

/** Step 1 — pick the CI target (only GitHub Actions is live). The repo is the
 *  one open in the sidebar, so there is nothing to type here. */
export function TargetStep({ hasRepo, error }: { hasRepo: boolean; error: string | null }) {
  const t = useTranslations("ci");
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {TARGETS.map((target) => {
          const I = Icon[target.icon];
          const selected = target.id === "gha";
          return (
            // Disabled cards are plain, non-interactive elements: no handlers, so
            // neither a click nor the keyboard can select them (C-AC-11).
            <div
              key={target.id}
              role="radio"
              aria-checked={selected}
              aria-disabled={target.disabled ? "true" : undefined}
              tabIndex={target.disabled ? -1 : 0}
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-xl border p-4",
                selected ? "border-primary bg-brand-bg" : "border-border bg-surface",
                target.disabled ? "cursor-not-allowed opacity-50" : "cursor-default",
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted">
                  <I size={16} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-base font-semibold">{t(`exportWizard.targets.${target.id}`)}</span>
                {target.id === "gha" && (
                  <Badge variant="brand">
                    {t("exportWizard.recommended")}
                  </Badge>
                )}
                {target.disabled && <Badge variant="neutral">{t("exportWizard.comingSoon")}</Badge>}
              </div>
              <div className="text-ui text-muted-foreground wrap-anywhere">{t(`exportWizard.targets.${target.id}Desc`)}</div>
            </div>
          );
        })}
      </div>

      {!hasRepo && <div className={ERROR}>{t("exportWizard.noRepo")}</div>}
      {error && <div className={ERROR}>{t("exportWizard.previewError", { message: error })}</div>}
    </>
  );
}
