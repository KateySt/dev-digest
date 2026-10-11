"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { CiLintViolation, CiPreview } from "@devdigest/shared";
import { WORKFLOW_PATH } from "../../constants";
import { formatBytes, isRunnerFile } from "../../helpers";
import { s } from "./styles";

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
        <div key={w} style={s.warning} role="note">
          <Icon.AlertTriangle size={14} />
          <span style={s.warningText}>
            <strong>{t("exportWizard.modelWarning")}:</strong> {w}
          </span>
        </div>
      ))}

      {violations.length > 0 && (
        <div style={s.lint} role="alert">
          <div style={s.lintTitle}>{t("exportWizard.lint.title")}</div>
          <ul style={s.lintList}>
            {violations.map((v) => (
              <li key={`${v.rule}:${v.location}`} className="mono" style={s.lintItem}>
                {t("exportWizard.lint.violation", { rule: v.rule, location: v.location, message: v.message })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={s.split}>
        <div style={s.listPane}>
          <div style={s.listLabel}>{t("exportWizard.filesToCreate")}</div>
          {preview.files.map((f) => (
            <button
              key={f.path}
              type="button"
              className="mono"
              onClick={() => setSelected(f.path)}
              style={s.fileItem(f.path === file?.path)}
              aria-pressed={f.path === file?.path}
            >
              <Icon.FileText size={14} style={s.fileIcon} />
              <span style={s.filePath}>{f.path}</span>
            </button>
          ))}
        </div>

        <div style={s.viewer}>
          {file && (
            <>
              <div style={s.viewerHeader}>
                <span className="mono" style={s.viewerPath} title={file.path}>
                  {file.path}
                </span>
                {isWorkflow && (
                  <Badge icon="Edit" style={s.editableBadge}>
                    {t("exportWizard.editable")}
                  </Badge>
                )}
              </div>
              {isRunnerFile(file) && file.metadata ? (
                <div style={s.runnerBox}>
                  <div>
                    {t("exportWizard.runner.summary", {
                      size: formatBytes(file.metadata.size_bytes),
                      version: file.metadata.runner_version,
                    })}
                  </div>
                  <div className="mono" style={s.hash}>
                    {t("exportWizard.runner.hash", { hash: file.metadata.sha256 })}
                  </div>
                  <div style={s.runnerNote}>{t("exportWizard.runner.note")}</div>
                </div>
              ) : isWorkflow ? (
                <textarea
                  className="mono"
                  aria-label={t("exportWizard.workflowEditorLabel")}
                  value={workflowDraft ?? file.contents}
                  onChange={(e) => onEditWorkflow(e.target.value)}
                  spellCheck={false}
                  style={s.editor}
                />
              ) : (
                <pre className="mono" style={s.pre}>
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
