"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { TARGETS } from "../../constants";
import { s } from "./styles";

/** Step 1 — pick the CI target (only GitHub Actions is live). The repo is the
 *  one open in the sidebar, so there is nothing to type here. */
export function TargetStep({ hasRepo, error }: { hasRepo: boolean; error: string | null }) {
  const t = useTranslations("ci");
  return (
    <>
      <div style={s.grid}>
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
              style={s.card(selected, target.disabled)}
            >
              <div style={s.cardTop}>
                <span style={s.iconBox}>
                  <I size={16} />
                </span>
                <span style={s.cardTitle}>{t(`exportWizard.targets.${target.id}`)}</span>
                {target.id === "gha" && (
                  <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                    {t("exportWizard.recommended")}
                  </Badge>
                )}
                {target.disabled && <Badge>{t("exportWizard.comingSoon")}</Badge>}
              </div>
              <div style={s.cardDesc}>{t(`exportWizard.targets.${target.id}Desc`)}</div>
            </div>
          );
        })}
      </div>

      {!hasRepo && <div style={s.error}>{t("exportWizard.noRepo")}</div>}
      {error && <div style={s.error}>{t("exportWizard.previewError", { message: error })}</div>}
    </>
  );
}
