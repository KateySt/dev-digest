"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CI_BRANCH, DOCS_URL, PR_TITLE } from "../../constants";
import type { InstallMethod } from "../../helpers";

const card = (selected: boolean) =>
  cn(
    "flex w-full min-w-0 cursor-pointer flex-col gap-1.5 rounded-xl border px-4 py-3.5 text-left text-foreground",
    selected ? "border-primary bg-brand-bg" : "border-border bg-surface hover:bg-accent",
  );

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
      <div className="flex flex-col items-start gap-2">
        <div className="flex items-center gap-2 text-md font-bold">
          <Icon.CheckCircle size={18} className="text-ok" aria-hidden />
          {t("exportWizard.installStep.doneTitle")}
        </div>
        <div className="text-sm text-muted-foreground wrap-anywhere">{t("exportWizard.installStep.doneBody", { repo })}</div>
        <a href={prUrl} target="_blank" rel="noopener noreferrer" className="text-brand-text">
          {t("exportWizard.installStep.viewPr")} →
        </a>
      </div>
    );
  }

  return (
    <>
      <div role="radiogroup" className="flex flex-col gap-2.5">
        <button
          type="button"
          role="radio"
          aria-checked={method === "pr"}
          onClick={() => onMethod("pr")}
          className={card(method === "pr")}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon.GitPullRequest size={15} className="shrink-0 text-brand-text" aria-hidden />
            <span className="min-w-0 flex-1 text-base font-semibold">{t("exportWizard.installStep.prTitle")}</span>
            <Badge variant="brand">
              {t("exportWizard.recommended")}
            </Badge>
          </div>
          <div className="text-sm leading-normal text-muted-foreground wrap-anywhere">
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
          className={card(method === "zip")}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon.Copy size={15} className="shrink-0 text-brand-text" aria-hidden />
            <span className="min-w-0 flex-1 text-base font-semibold">{t("exportWizard.installStep.zipTitle")}</span>
            <span className="text-xs text-subtle-foreground">{t("exportWizard.installStep.zipHint")}</span>
          </div>
        </button>
      </div>

      {error && (
        <div role="alert" className="text-sm text-crit wrap-anywhere">
          {error}
        </div>
      )}
      {zipDone && <div className="text-sm text-ok">{t("exportWizard.installStep.zipDone")}</div>}

      <div className="text-center text-ui text-subtle-foreground">
        {t("exportWizard.installStep.helpLead")}{" "}
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="text-brand-text">
          {t("exportWizard.installStep.helpLink")} →
        </a>
      </div>
    </>
  );
}
