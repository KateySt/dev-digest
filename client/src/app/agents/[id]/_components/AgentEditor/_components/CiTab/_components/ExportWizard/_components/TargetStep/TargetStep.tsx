"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, FormField, Icon, TextInput } from "@devdigest/ui";
import { TARGETS } from "../../constants";
import { s } from "./styles";

/** Step 1 — pick the CI target (only GitHub Actions is live) and the repo. */
export function TargetStep({
  repo,
  onRepo,
  error,
}: {
  repo: string;
  onRepo: (repo: string) => void;
  error: string | null;
}) {
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

      <FormField label={t("exportWizard.repoLabel")} hint={t("exportWizard.repoHint")} required>
        <TextInput
          value={repo}
          onChange={onRepo}
          placeholder={t("exportWizard.repoPlaceholder")}
          mono
          aria-label={t("exportWizard.repoLabel")}
        />
      </FormField>
      {error && <div style={s.error}>{t("exportWizard.previewError", { message: error })}</div>}
    </>
  );
}
