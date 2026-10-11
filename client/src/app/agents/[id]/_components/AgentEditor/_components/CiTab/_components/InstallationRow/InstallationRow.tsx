"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { CiInstallation } from "@devdigest/shared";
import { ciStatusTone, isKnownCiStatus } from "@/lib/ci-status";
import { fullRelativeTime } from "@/app/repos/[repoId]/pulls/helpers";
import { s } from "./styles";

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
  const tone = ciStatusTone(status);

  return (
    <div style={s.row}>
      <Icon.GitBranch size={15} style={s.icon} />
      <span className="mono" style={s.repo}>
        {installation.repo}
      </span>
      <Badge mono>{t("ciTab.githubActions")}</Badge>
      {installation.workflow_version != null && (
        <span style={s.meta}>{t("ciTab.workflowVersion", { version: installation.workflow_version })}</span>
      )}
      {installation.out_of_date && (
        <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
          {t("ciTab.outOfDate")}
        </Badge>
      )}
      {status ? (
        <Badge color={tone.color} bg={tone.bg} dot>
          {isKnownCiStatus(status) ? t(`runs.status.${status}`) : status}
        </Badge>
      ) : (
        <span style={s.meta}>{t("ciTab.neverRun")}</span>
      )}
      {installation.last_run_at && <span style={s.meta}>{fullRelativeTime(installation.last_run_at)}</span>}
      {installation.pr_url && (
        <a href={installation.pr_url} target="_blank" rel="noopener noreferrer" style={s.link}>
          {t("ciTab.viewPr")}
        </a>
      )}
      {installation.out_of_date && (
        <Button size="sm" icon="RefreshCw" onClick={() => onUpdate(installation)}>
          {t("ciTab.updateCiConfig")}
        </Button>
      )}
    </div>
  );
}
