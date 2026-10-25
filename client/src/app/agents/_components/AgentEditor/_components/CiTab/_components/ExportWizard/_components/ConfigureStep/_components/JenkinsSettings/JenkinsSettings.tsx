"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { CiFailOn } from "@devdigest/shared";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useJenkinsConnection } from "@/lib/hooks/ci";
import type { JenkinsFields } from "../../../../constants";
import { jenkinsFieldErrors } from "../../../../helpers";

const LABEL = "mb-2 text-sm font-semibold text-muted-foreground";
const TH = "border-b border-border px-2.5 pb-1.5 text-left text-2xs font-semibold tracking-[0.03em] text-subtle-foreground uppercase";
const TD = "border-b border-border px-2.5 py-2.25 align-top text-sm wrap-anywhere";

const FIELDS: readonly { key: keyof JenkinsFields; label: string; hint?: string; error: string }[] = [
  { key: "job_name", label: "jobName", hint: "jobNameHint", error: "invalidJobName" },
  { key: "openrouter_credential_id", label: "openrouterId", error: "invalidCredential" },
  { key: "github_credential_id", label: "githubId", error: "invalidCredential" },
  { key: "agent_label", label: "agentLabel", hint: "agentLabelHint", error: "invalidLabel" },
];

/** Jenkins part of Configure (C-AC-39..42): the repo-wide job/credential/label
 *  fields, the repo's Jenkins server, the credential IDs Jenkins must hold
 *  (IDs only — never a value) and how to block merges. */
export function JenkinsSettings({
  repo,
  fields,
  onFields,
  failOn,
  onOpenConnection,
}: {
  repo: string;
  fields: JenkinsFields;
  onFields: (patch: Partial<JenkinsFields>) => void;
  failOn: CiFailOn;
  onOpenConnection: () => void;
}) {
  const t = useTranslations("ci.exportWizard.configure.jenkins");
  const id = React.useId();
  const errors = jenkinsFieldErrors(fields);
  const connection = useJenkinsConnection(repo);

  return (
    <>
      <div className="grid min-w-0 grid-cols-1 gap-x-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <FormField key={f.key} label={t(f.label)} hint={f.hint ? t(f.hint) : undefined} htmlFor={`${id}-${f.key}`}>
            <Input
              id={`${id}-${f.key}`}
              className="mono"
              autoComplete="off"
              value={fields[f.key]}
              aria-invalid={errors[f.key] ? true : undefined}
              aria-describedby={errors[f.key] ? `${id}-${f.key}-err` : undefined}
              onChange={(e) => onFields({ [f.key]: e.target.value })}
            />
            {errors[f.key] && (
              <div id={`${id}-${f.key}-err`} className="text-xs text-crit">
                {t(f.error)}
              </div>
            )}
          </FormField>
        ))}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3">
        <Icon.Globe size={15} className="shrink-0 text-subtle-foreground" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold">{t("serverTitle")}</span>
          {connection.data ? (
            <span className="mono min-w-0 text-xs text-muted-foreground wrap-anywhere">
              {t("connected", { url: connection.data.url, user: connection.data.username })}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t("notConnected")} · {t("notConnectedNote")}
            </span>
          )}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onOpenConnection}>
          {connection.data ? t("edit") : t("connect")}
        </Button>
      </div>

      <div>
        <div className={LABEL}>{t("secretsTitle")}</div>
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              <th className={TH}>{t("credential")}</th>
              <th className={`${TH} w-[40%]`}>{t("kind")}</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                [fields.openrouter_credential_id, t("openrouterNote")],
                [fields.github_credential_id, t("githubNote")],
              ] as const
            ).map(([credentialId, note]) => (
              <tr key={note}>
                <td className={`mono ${TD}`}>
                  {credentialId}
                  <div className="mt-0.5 font-sans text-xs text-subtle-foreground">{note}</div>
                </td>
                <td className={TD}>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="neutral">{t("secretText")}</Badge>
                    <Badge variant="neutral">{t("verifyInJenkins")}</Badge>
                  </div>
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
        <span>{t("infoBox", { failOn })}</span>
      </div>
    </>
  );
}
