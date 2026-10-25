"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CiInstallation } from "@devdigest/shared";
import { ciStatusBadge, isKnownCiStatus } from "@/lib/ci-status";
import { fullRelativeTime } from "@/app/repos/[repoId]/pulls/helpers";
import { ciSyncErrorView, isCiSyncErrorCode } from "@/lib/ci-sync-errors";

const META = "text-ui whitespace-nowrap text-subtle-foreground";

/** One installation: repo, target chip, workflow/Jenkinsfile version, last run
 *  status + relative time and the install PR. An out-of-date installation (its
 *  exported Fail CI on no longer matches the agent) gets a badge and an update
 *  action. Jenkins rows add the job, the repo's connection and the last sync
 *  error with its fix (C-AC-47/50). */
export function InstallationRow({
  installation,
  onUpdate,
  onConnection,
}: {
  installation: CiInstallation;
  onUpdate: (installation: CiInstallation) => void;
  onConnection: (repo: string) => void;
}) {
  const t = useTranslations("ci");
  const isJenkins = installation.target_type === "jenkins";
  const syncError = isCiSyncErrorCode(installation.last_sync_error)
    ? ciSyncErrorView(installation.last_sync_error)
    : null;
  const fix = () => (syncError?.action === "reexport" ? onUpdate(installation) : onConnection(installation.repo));
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
        {isJenkins ? t("ciTab.jenkins") : t("ciTab.githubActions")}
      </Badge>
      {installation.workflow_version != null && (
        <span className={META}>
          {isJenkins
            ? t("ciTab.jenkinsfileVersion", { version: installation.workflow_version })
            : t("ciTab.workflowVersion", { version: installation.workflow_version })}
        </span>
      )}
      {isJenkins && installation.ci_job_name && (
        <span className="mono min-w-0 text-ui text-subtle-foreground wrap-anywhere">
          {t("ciTab.job", { name: installation.ci_job_name })}
        </span>
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
      {isJenkins && (
        <Button variant="ghost" size="sm" onClick={() => onConnection(installation.repo)}>
          <Icon.Settings aria-hidden />
          {t("ciTab.jenkinsConnection")}
        </Button>
      )}
      {syncError && (
        <div role="alert" className="flex w-full min-w-0 flex-wrap items-center gap-2 border-t border-border pt-2 text-sm">
          <Icon.AlertTriangle size={14} className="shrink-0 text-crit" aria-hidden />
          <span className="min-w-0 flex-1 wrap-anywhere">
            <span className="text-crit">{t(`jenkins.syncErrors.${syncError.whatKey}`)}</span>{" "}
            <span className="text-muted-foreground">{t(`jenkins.syncErrors.${syncError.fixKey}`)}</span>
          </span>
          <Button variant="secondary" size="sm" onClick={fix}>
            {t(`jenkins.syncErrors.${syncError.actionKey}`)}
          </Button>
        </div>
      )}
    </div>
  );
}
