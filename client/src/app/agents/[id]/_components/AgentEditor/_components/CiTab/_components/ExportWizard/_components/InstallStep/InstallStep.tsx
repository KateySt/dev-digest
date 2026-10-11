"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { CI_BRANCH, DOCS_URL, PR_TITLE } from "../../constants";
import type { InstallMethod } from "../../helpers";
import { s } from "./styles";

/** Step 4 - choose how to install: open a PR, or download a zip. The actual
 *  request is fired by the wizard footer's Install button. */
export function InstallStep({
  repo,
  fileCount,
  method,
  onMethod,
  prUrl,
  zipDone,
  error,
}: {
  repo: string;
  fileCount: number;
  method: InstallMethod;
  onMethod: (m: InstallMethod) => void;
  /** Set once the export succeeded - switches the step to its done state. */
  prUrl: string | null;
  zipDone: boolean;
  error: string | null;
}) {
  const t = useTranslations("ci");

  if (prUrl) {
    return (
      <div style={s.done}>
        <div style={s.doneTitle}>
          <Icon.CheckCircle size={18} style={s.doneIcon} />
          {t("exportWizard.installStep.doneTitle")}
        </div>
        <div style={s.doneBody}>{t("exportWizard.installStep.doneBody", { repo })}</div>
        <a href={prUrl} target="_blank" rel="noopener noreferrer" style={s.link}>
          {t("exportWizard.installStep.viewPr")} →
        </a>
      </div>
    );
  }

  return (
    <>
      <div role="radiogroup" style={s.options}>
        <button
          type="button"
          role="radio"
          aria-checked={method === "pr"}
          onClick={() => onMethod("pr")}
          style={s.card(method === "pr")}
        >
          <div style={s.cardTop}>
            <Icon.GitPullRequest size={15} style={s.cardIcon} />
            <span style={s.cardTitle}>{t("exportWizard.installStep.prTitle")}</span>
            <Badge color="var(--accent-text)" bg="var(--accent-bg)">
              {t("exportWizard.recommended")}
            </Badge>
          </div>
          <div style={s.cardBody}>
            {t("exportWizard.installStep.prBody", {
              repo,
              branch: CI_BRANCH,
              title: PR_TITLE,
              count: fileCount,
            })}
          </div>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={method === "zip"}
          onClick={() => onMethod("zip")}
          style={s.card(method === "zip")}
        >
          <div style={s.cardTop}>
            <Icon.Copy size={15} style={s.cardIcon} />
            <span style={s.cardTitle}>{t("exportWizard.installStep.zipTitle")}</span>
            <span style={s.cardHint}>{t("exportWizard.installStep.zipHint")}</span>
          </div>
        </button>
      </div>

      {error && (
        <div style={s.error} role="alert">
          {error}
        </div>
      )}
      {zipDone && <div style={s.ok}>{t("exportWizard.installStep.zipDone")}</div>}

      <div style={s.help}>
        {t("exportWizard.installStep.helpLead")}{" "}
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" style={s.link}>
          {t("exportWizard.installStep.helpLink")} →
        </a>
      </div>
    </>
  );
}
