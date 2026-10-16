"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FilterChip } from "@/components/filter-chip";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import type { CiFailOn, CiPostAs, CiTrigger } from "@devdigest/shared";
import { ALL_TRIGGERS, EXPECTED_SECRETS, POST_AS_OPTIONS } from "../../constants";
import { toggleTrigger } from "./helpers";

const LABEL = "mb-2 text-sm font-semibold text-muted-foreground";
const HINT = "mt-2 text-xs text-subtle-foreground";
const TH = "border-b border-border px-2.5 pb-1.5 text-left text-2xs font-semibold tracking-[0.03em] text-subtle-foreground uppercase";
const TD = "border-b border-border px-2.5 py-2.25 align-top text-sm wrap-anywhere";

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
        <div className={LABEL}>{t("exportWizard.configure.triggerLabel")}</div>
        <div className="flex flex-wrap gap-2">
          {ALL_TRIGGERS.map((trigger) => {
            const on = triggers.includes(trigger);
            return (
              <FilterChip
                key={trigger}
                active={on}
                {...(on ? { icon: "Check" as const } : {})}
                onClick={() => onTriggers(toggleTrigger(triggers, trigger))}
              >
                {t(`exportWizard.configure.trigger${trigger[0]!.toUpperCase()}${trigger.slice(1)}`)}
              </FilterChip>
            );
          })}
        </div>
        {triggers.length === 0 && <div className={HINT}>{t("exportWizard.configure.triggerNone")}</div>}
        {editsDiscarded && <div className={HINT}>{t("exportWizard.configure.editsDiscarded")}</div>}
      </div>

      <div>
        <div className={LABEL}>{t("exportWizard.postResultsLabel")}</div>
        <div role="radiogroup" aria-label={t("exportWizard.postResultsLabel")} className="flex flex-col gap-2">
          {POST_AS_OPTIONS.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                className="accent-primary"
                name="ci-post-as"
                checked={postAs === o.value}
                onChange={() => onPostAs(o.value)}
              />
              {t(`exportWizard.postAs.${o.labelKey}`)}
              {o.value === "github_review" && (
                <Badge variant="brand">
                  {t("exportWizard.recommended")}
                </Badge>
              )}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className={LABEL}>{t("exportWizard.secrets.title")}</div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>{t("exportWizard.secrets.name")}</th>
              <th className={TH}>{t("exportWizard.secrets.status")}</th>
            </tr>
          </thead>
          <tbody>
            {EXPECTED_SECRETS.map((name) => (
              <tr key={name}>
                <td className={`mono ${TD}`}>
                  {name}
                  <div className="mt-0.5 text-xs text-subtle-foreground">
                    {name === "GITHUB_TOKEN"
                      ? t("exportWizard.secrets.githubNote")
                      : t("exportWizard.secrets.openrouterNote")}
                  </div>
                </td>
                <td className={TD}>
                  <Badge variant="neutral">{t("exportWizard.secrets.verifyInRepo")}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        role="note"
        className="flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3 text-sm leading-normal text-muted-foreground"
      >
        <Icon.Info size={15} className="mt-0.5 shrink-0 text-subtle-foreground" aria-hidden />
        <span>
          {t("exportWizard.infoBox.lead")} <strong>{t("exportWizard.infoBox.failOnLabel")}</strong>{" "}
          {t("exportWizard.infoBox.current", { failOn })} {t("exportWizard.infoBox.middle")}{" "}
          <strong>{t("exportWizard.infoBox.requiredCheck")}</strong> {t("exportWizard.infoBox.tail")}
        </span>
      </div>
      {error && <div className="text-sm text-crit wrap-anywhere">{t("exportWizard.previewError", { message: error })}</div>}
    </>
  );
}
