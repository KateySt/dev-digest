"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CiInstallation } from "@devdigest/shared";
import { ciStatusBadge, isKnownCiStatus } from "@/lib/ci-status";
import { fullRelativeTime } from "@/app/repos/[repoId]/pulls/helpers";

const META = "text-ui whitespace-nowrap text-subtle-foreground";

/** One installation: repo, target chip, workflow version, last run status +
 *  relative time and the install PR. An out-of-date installation (its exported
 *  Fail CI on no longer matches the agent) gets a badge and an update action. */
export function InstallationRow({
  installation,
  onUpdate,
}: {
  installation: CiInstallation;
  onUpdate: (installation: CiInstallation) => void;
}) {
  const t = useTranslations("ci");
  const status = installation.last_run_status;
  const tone = ciStatusBadge(status);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.75">
      <Icon.GitBranch size={15} className="shrink-0 text-subtle-foreground" aria-hidden />
      {/* The repo is an unbroken mono string: let it wrap. */}
      <span className="mono min-w-0 flex-1 text-[13.5px] font-semibold wrap-anywhere">
        {installation.repo}
      </span>
      <Badge variant="neutral" className="mono">
        {t("ciTab.githubActions")}
      </Badge>
      {installation.workflow_version != null && (
        <span className={META}>{t("ciTab.workflowVersion", { version: installation.workflow_version })}</span>
      )}
      {installation.out_of_date && (
        <Badge variant="warn">
          <Icon.AlertTriangle aria-hidden />
          {t("ciTab.outOfDate")}
        </Badge>
      )}
      {status ? (
        <Badge variant={tone.variant}>
          <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
          {isKnownCiStatus(status) ? t(`runs.status.${status}`) : status}
        </Badge>
      ) : (
        <span className={META}>{t("ciTab.neverRun")}</span>
      )}
      {installation.last_run_at && <span className={META}>{fullRelativeTime(installation.last_run_at)}</span>}
      {installation.pr_url && (
        <a href={installation.pr_url} target="_blank" rel="noopener noreferrer" className="text-ui text-brand-text">
          {t("ciTab.viewPr")}
        </a>
      )}
      {installation.out_of_date && (
        <Button variant="secondary" size="sm" onClick={() => onUpdate(installation)}>
          <Icon.RefreshCw aria-hidden />
          {t("ciTab.updateCiConfig")}
        </Button>
      )}
    </div>
  );
}
