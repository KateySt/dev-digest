"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, IconBtn, TextInput } from "@devdigest/ui";
import type { EvalCaseKind, FindingCategory, Severity } from "@devdigest/shared";
import type { ParsedDiffFile } from "@/lib/eval";
import {
  CATEGORIES,
  SEVERITIES,
  emptyEntry,
  entryErrors,
  entryWarning,
  type EntryDraft,
} from "../../entries";
import { s } from "../../styles";

/** Structured editor for a case's expected output: a list of expected findings
 *  (must find) or forbidden locations (must not flag) with add / remove. Line
 *  fields are validated inline (positive integers, start ≤ end); a file or
 *  range missing from the pasted diff shows a non-blocking warning. */
export function ExpectedEntriesForm({
  kind,
  entries,
  onChange,
  diff,
  diffFiles,
}: {
  kind: EvalCaseKind;
  entries: EntryDraft[];
  onChange: (next: EntryDraft[]) => void;
  diff: string;
  diffFiles: readonly ParsedDiffFile[];
}) {
  const t = useTranslations("eval");
  const mustFind = kind === "must_find";
  const patch = (i: number, p: Partial<EntryDraft>) => onChange(entries.map((e, j) => (j === i ? { ...e, ...p } : e)));

  return (
    <div style={s.entries}>
      {entries.length === 0 && (
        <div style={s.entriesEmpty}>{mustFind ? t("caseEditor.emptyMustFind") : t("caseEditor.emptyMustNotFlag")}</div>
      )}

      {entries.map((e, i) => {
        const err = entryErrors(e);
        const warning = entryWarning(e, diff, diffFiles);
        const n = i + 1;
        return (
          <div key={i} role="group" aria-label={t("caseEditor.entryLabel", { index: n })} style={s.entry}>
            <div style={s.entryTop}>
              <div style={s.entryFile}>
                <TextInput
                  mono
                  value={e.file}
                  onChange={(v) => patch(i, { file: v })}
                  placeholder="src/example.ts"
                  aria-label={t("caseEditor.fileField")}
                />
              </div>
              <div style={s.lineField(err.start || err.range)}>
                <TextInput
                  mono
                  value={e.start}
                  onChange={(v) => patch(i, { start: v })}
                  inputMode="numeric"
                  aria-label={t("caseEditor.startLine")}
                  aria-invalid={err.start || err.range}
                />
              </div>
              <div style={s.lineField(err.end || err.range)}>
                <TextInput
                  mono
                  value={e.end}
                  onChange={(v) => patch(i, { end: v })}
                  inputMode="numeric"
                  aria-label={t("caseEditor.endLine")}
                  aria-invalid={err.end || err.range}
                />
              </div>
              <IconBtn
                icon="Trash"
                label={t("caseEditor.removeEntry", { index: n })}
                danger
                onClick={() => onChange(entries.filter((_, j) => j !== i))}
              />
            </div>

            {mustFind && (
              <div style={s.entryMeta}>
                <select
                  aria-label={t("caseEditor.severityField")}
                  value={e.severity}
                  onChange={(ev) => patch(i, { severity: ev.target.value as Severity })}
                  style={s.nativeSelect}
                >
                  {SEVERITIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("caseEditor.categoryField")}
                  value={e.category}
                  onChange={(ev) => patch(i, { category: ev.target.value as FindingCategory })}
                  style={s.nativeSelect}
                >
                  {CATEGORIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <div style={s.entryTitle}>
                  <TextInput
                    value={e.title}
                    onChange={(v) => patch(i, { title: v })}
                    placeholder={t("caseEditor.titleFieldPlaceholder")}
                    aria-label={t("caseEditor.titleField")}
                  />
                </div>
              </div>
            )}

            {(err.start || err.end) && (
              <div role="alert" style={s.fieldError}>
                {t("caseEditor.invalidLine")}
              </div>
            )}
            {err.range && (
              <div role="alert" style={s.fieldError}>
                {t("caseEditor.invalidRange")}
              </div>
            )}
            {warning && (
              <div role="status" style={s.entryWarning}>
                <Icon.AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{warning === "file" ? t("caseEditor.warnFile") : t("caseEditor.warnLines")}</span>
              </div>
            )}
          </div>
        );
      })}

      <div>
        <Button kind="ghost" size="sm" icon="Plus" onClick={() => onChange([...entries, emptyEntry()])}>
          {mustFind ? t("caseEditor.addFinding") : t("caseEditor.addLocation")}
        </Button>
      </div>
    </div>
  );
}
