"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { CiExport } from "@devdigest/shared";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { isCredentialId } from "../../../../helpers";

const KNOWN_CODES = [
  "jenkins_plugin_missing",
  "jenkins_job_conflict",
  "jenkins_auth_failed",
  "jenkins_unreachable",
  "jenkins_create_failed",
] as const;

/** C-AC-43: "Also create the Jenkins job" + the scan credential. Disabled, with a
 *  visible reason and a Connect action, while the repo has no Jenkins connection. */
export function JenkinsJobOption({
  jobName,
  connected,
  createJob,
  onCreateJob,
  scanCredentialId,
  onScanCredentialId,
  onOpenConnection,
}: {
  jobName: string;
  connected: boolean;
  createJob: boolean;
  onCreateJob: (value: boolean) => void;
  scanCredentialId: string;
  onScanCredentialId: (value: string) => void;
  onOpenConnection: () => void;
}) {
  const t = useTranslations("ci.exportWizard.installStep.jenkins");
  const id = React.useId();
  const scanInvalid = createJob && !isCredentialId(scanCredentialId.trim());

  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <Checkbox
          id={`${id}-create`}
          checked={connected && createJob}
          disabled={!connected}
          aria-describedby={connected ? undefined : `${id}-reason`}
          onCheckedChange={(v) => onCreateJob(v === true)}
          className="mt-0.5"
        />
        <label htmlFor={`${id}-create`} className="min-w-0 text-sm font-semibold wrap-anywhere">
          {t("createJob", { job: jobName })}
        </label>
      </div>
      {!connected && (
        <div className="flex min-w-0 flex-wrap items-center gap-2.5 pl-6.5">
          <span id={`${id}-reason`} className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t("noConnection")}
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={onOpenConnection}>
            {t("connect")}
          </Button>
        </div>
      )}
      {connected && createJob && (
        <div className="flex min-w-0 flex-col gap-1.5 pl-6.5">
          <label htmlFor={`${id}-scan`} className="text-xs font-semibold text-muted-foreground">
            {t("scanId")}
          </label>
          <Input
            id={`${id}-scan`}
            className="mono"
            autoComplete="off"
            value={scanCredentialId}
            aria-invalid={scanInvalid ? true : undefined}
            onChange={(e) => onScanCredentialId(e.target.value)}
          />
          <span className={scanInvalid ? "text-xs text-crit" : "text-xs text-subtle-foreground"}>
            {scanInvalid ? t("scanInvalid") : t("scanIdHint")}
          </span>
        </div>
      )}
    </div>
  );
}

/** C-AC-44: the job outcome on the done state (the PR was opened either way). */
export function JenkinsJobOutcome({ job }: { job: NonNullable<CiExport["jenkins_job"]> }) {
  const t = useTranslations("ci.exportWizard.installStep.jenkins");
  if (job.status === "failed") {
    const code = KNOWN_CODES.find((c) => c === job.code) ?? "unknown";
    return (
      <div role="alert" className="flex min-w-0 items-start gap-2 text-sm text-crit wrap-anywhere">
        <Icon.AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
        {t("jobFailed", { reason: t(`codes.${code}`) })}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <Icon.CheckCircle size={15} className="shrink-0 text-ok" aria-hidden />
      {job.status === "created" ? t("jobCreated") : t("jobExists")}
      {job.url && (
        <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-brand-text">
          {t("viewJob")} →
        </a>
      )}
    </div>
  );
}
