"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CiLintViolation, CiPreview } from "@devdigest/shared";
import { WORKFLOW_PATH } from "../../constants";
import { formatBytes, isRunnerFile } from "../../helpers";

/* Paths are unbroken mono strings: every container that can hold one is
   min-w-0 and wraps anywhere (client INSIGHTS 2026-09-24). */

/** Step 2 - what will be committed. The workflow is editable (server-linted on
 *  Continue); the runner shows metadata only; everything else is read-only. */
export function PreviewStep({
  preview,
  workflowDraft,
  onEditWorkflow,
  violations,
}: {
  preview: CiPreview;
  workflowDraft: string | null;
  onEditWorkflow: (text: string) => void;
  violations: CiLintViolation[];
}) {
  const t = useTranslations("ci");
  const [selected, setSelected] = React.useState(WORKFLOW_PATH);
  const file = preview.files.find((f) => f.path === selected) ?? preview.files[0];
  const isWorkflow = file?.path === WORKFLOW_PATH;

  return (
    <>
      {preview.warnings.map((w) => (
        <div
          key={w}
          role="note"
          className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-ui text-muted-foreground"
        >
          <Icon.AlertTriangle size={14} aria-hidden />
          <span className="min-w-0 wrap-anywhere">
            <strong>{t("exportWizard.modelWarning")}:</strong> {w}
          </span>
        </div>
      ))}

      {violations.length > 0 && (
        <div role="alert" className="rounded-lg border border-crit bg-surface px-3 py-2.5 text-ui">
          <div className="mb-1.5 font-semibold text-crit">{t("exportWizard.lint.title")}</div>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-4.5">
            {violations.map((v) => (
              <li key={`${v.rule}:${v.location}`} className="mono text-xs wrap-anywhere">
                {t("exportWizard.lint.violation", { rule: v.rule, location: v.location, message: v.message })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-[minmax(0,240px)_minmax(0,1fr)] gap-3">
        <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface p-2.5">
          <div className="px-1.5 pt-0.5 pb-2 text-2xs font-semibold tracking-[0.03em] text-subtle-foreground">
            {t("exportWizard.filesToCreate")}
          </div>
          {preview.files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setSelected(f.path)}
              aria-pressed={f.path === file?.path}
              className={cn(
                "mono flex w-full min-w-0 cursor-pointer items-start gap-2 rounded-md border-none px-2 py-1.75 text-left text-ui",
                f.path === file?.path ? "bg-brand-bg text-brand-text" : "bg-transparent text-muted-foreground hover:bg-accent",
              )}
            >
              <Icon.FileText size={14} className="mt-0.5 shrink-0" aria-hidden />
              <span className="min-w-0 wrap-anywhere">{f.path}</span>
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          {file && (
            <>
              <div className="flex min-w-0 items-center gap-2.5 border-b border-border px-3 py-2.25">
                <span className="mono min-w-0 flex-1 truncate text-ui" title={file.path}>
                  {file.path}
                </span>
                {isWorkflow && (
                  <Badge variant="neutral" className="shrink-0">
                    <Icon.Edit aria-hidden />
                    {t("exportWizard.editable")}
                  </Badge>
                )}
              </div>
              {isRunnerFile(file) && file.metadata ? (
                <div className="flex min-w-0 flex-col gap-1.5 p-3 text-sm">
                  <div>
                    {t("exportWizard.runner.summary", {
                      size: formatBytes(file.metadata.size_bytes),
                      version: file.metadata.runner_version,
                    })}
                  </div>
                  <div className="mono text-xs text-muted-foreground wrap-anywhere">
                    {t("exportWizard.runner.hash", { hash: file.metadata.sha256 })}
                  </div>
                  <div className="text-xs text-subtle-foreground">{t("exportWizard.runner.note")}</div>
                </div>
              ) : isWorkflow ? (
                <textarea
                  aria-label={t("exportWizard.workflowEditorLabel")}
                  value={workflowDraft ?? file.contents}
                  onChange={(e) => onEditWorkflow(e.target.value)}
                  spellCheck={false}
                  className="mono min-h-75 w-full resize-y overflow-auto border-none bg-elevated p-3 text-xs leading-[1.55] whitespace-pre text-foreground outline-none"
                />
              ) : (
                <pre className="mono m-0 max-h-85 min-h-30 overflow-auto bg-elevated p-3 text-xs leading-[1.55] whitespace-pre-wrap wrap-anywhere">
                  {file.contents}
                </pre>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
