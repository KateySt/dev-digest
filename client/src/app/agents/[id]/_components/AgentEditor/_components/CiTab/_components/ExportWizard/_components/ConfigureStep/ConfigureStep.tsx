"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Chip, Icon } from "@devdigest/ui";
import type { CiFailOn, CiPostAs, CiTrigger } from "@devdigest/shared";
import { ALL_TRIGGERS, EXPECTED_SECRETS, POST_AS_OPTIONS } from "../../constants";
import { toggleTrigger } from "./helpers";
import { s } from "./styles";

/** Step 3 - triggers, where results are posted, the secrets the repo needs
 *  (names only: this UI never reads, asks for or shows a secret value) and how
 *  to block merges. */
export function ConfigureStep({
  triggers,
  onTriggers,
  postAs,
  onPostAs,
  failOn,
  editsDiscarded,
  error,
}: {
  triggers: CiTrigger[];
  onTriggers: (triggers: CiTrigger[]) => void;
  postAs: CiPostAs;
  onPostAs: (postAs: CiPostAs) => void;
  failOn: CiFailOn;
  editsDiscarded: boolean;
  error: string | null;
}) {
  const t = useTranslations("ci");
  return (
    <>
      <div>
        <div style={s.label}>{t("exportWizard.configure.triggerLabel")}</div>
        <div style={s.chips}>
          {ALL_TRIGGERS.map((trigger) => {
            const on = triggers.includes(trigger);
            return (
              <Chip
                key={trigger}
                active={on}
                {...(on ? { icon: "Check" as const } : {})}
                onClick={() => onTriggers(toggleTrigger(triggers, trigger))}
              >
                {t(`exportWizard.configure.trigger${trigger[0]!.toUpperCase()}${trigger.slice(1)}`)}
              </Chip>
            );
          })}
        </div>
        {triggers.length === 0 && <div style={s.hint}>{t("exportWizard.configure.triggerNone")}</div>}
        {editsDiscarded && <div style={s.hint}>{t("exportWizard.configure.editsDiscarded")}</div>}
      </div>

      <div>
        <div style={s.label}>{t("exportWizard.postResultsLabel")}</div>
        <div role="radiogroup" aria-label={t("exportWizard.postResultsLabel")} style={s.radios}>
          {POST_AS_OPTIONS.map((o) => (
            <label key={o.value} style={s.radio}>
              <input
                type="radio"
                name="ci-post-as"
                checked={postAs === o.value}
                onChange={() => onPostAs(o.value)}
              />
              {t(`exportWizard.postAs.${o.labelKey}`)}
              {o.value === "github_review" && (
                <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                  {t("exportWizard.recommended")}
                </Badge>
              )}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div style={s.label}>{t("exportWizard.secrets.title")}</div>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>{t("exportWizard.secrets.name")}</th>
              <th style={s.th}>{t("exportWizard.secrets.status")}</th>
            </tr>
          </thead>
          <tbody>
            {EXPECTED_SECRETS.map((name) => (
              <tr key={name}>
                <td className="mono" style={s.td}>
                  {name}
                  <div style={s.note}>
                    {name === "GITHUB_TOKEN"
                      ? t("exportWizard.secrets.githubNote")
                      : t("exportWizard.secrets.openrouterNote")}
                  </div>
                </td>
                <td style={s.td}>
                  <Badge>{t("exportWizard.secrets.verifyInRepo")}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={s.info} role="note">
        <Icon.Info size={15} style={s.infoIcon} />
        <span>
          {t("exportWizard.infoBox.lead")} <strong>{t("exportWizard.infoBox.failOnLabel")}</strong>{" "}
          {t("exportWizard.infoBox.current", { failOn })} {t("exportWizard.infoBox.middle")}{" "}
          <strong>{t("exportWizard.infoBox.requiredCheck")}</strong> {t("exportWizard.infoBox.tail")}
        </span>
      </div>
      {error && <div style={s.error}>{t("exportWizard.previewError", { message: error })}</div>}
    </>
  );
}
