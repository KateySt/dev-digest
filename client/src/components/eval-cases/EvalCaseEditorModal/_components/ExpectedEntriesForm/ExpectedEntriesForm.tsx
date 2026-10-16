"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { EvalCaseKind, FindingCategory, Severity } from "@devdigest/shared";
import type { ParsedDiffFile } from "@/lib/eval";
import { CATEGORIES, SEVERITIES, emptyEntry, entryErrors, entryWarning, type EntryDraft } from "../../entries";

/** Structured editor for a case's expected output: a list of expected findings
 *  (must find) or forbidden locations (must not flag) with add / remove. Line
 *  fields are validated inline (positive integers, start ≤ end); a file or
 *  range missing from the pasted diff shows a non-blocking warning. */
/** Native selects (tests and keyboard users drive them like plain form fields). */
const NATIVE_SELECT = "rounded-[7px] border border-border-strong bg-elevated px-2 py-2.25 text-sm text-foreground";
const FIELD_ERROR = "text-xs wrap-anywhere text-crit";

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
    <div className="flex min-w-0 flex-col gap-2.5">
      {entries.length === 0 && (
        <div className="text-ui wrap-anywhere text-subtle-foreground">
          {mustFind ? t("caseEditor.emptyMustFind") : t("caseEditor.emptyMustNotFlag")}
        </div>
      )}

      {entries.map((e, i) => {
        const err = entryErrors(e);
        const warning = entryWarning(e, diff, diffFiles);
        const n = i + 1;
        return (
          <div
            key={i}
            role="group"
            aria-label={t("caseEditor.entryLabel", { index: n })}
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-2.5"
          >
            {/* minmax(0, 1fr) file column + fixed line columns: a long path wraps/clips inside its own track. */}
            <div className="grid grid-cols-[minmax(0,1fr)_72px_72px_auto] items-center gap-2">
              <div className="min-w-0">
                <Input
                  className="mono"
                  value={e.file}
                  onChange={(ev) => patch(i, { file: ev.target.value })}
                  placeholder="src/example.ts"
                  aria-label={t("caseEditor.fileField")}
                />
              </div>
              <div className="min-w-0">
                <Input
                  className="mono"
                  value={e.start}
                  onChange={(ev) => patch(i, { start: ev.target.value })}
                  inputMode="numeric"
                  aria-label={t("caseEditor.startLine")}
                  aria-invalid={err.start || err.range}
                />
              </div>
              <div className="min-w-0">
                <Input
                  className="mono"
                  value={e.end}
                  onChange={(ev) => patch(i, { end: ev.target.value })}
                  inputMode="numeric"
                  aria-label={t("caseEditor.endLine")}
                  aria-invalid={err.end || err.range}
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="hover:text-crit"
                aria-label={t("caseEditor.removeEntry", { index: n })}
                title={t("caseEditor.removeEntry", { index: n })}
                onClick={() => onChange(entries.filter((_, j) => j !== i))}
              >
                <Icon.Trash aria-hidden />
              </Button>
            </div>

            {mustFind && (
              <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2">
                <select
                  aria-label={t("caseEditor.severityField")}
                  value={e.severity}
                  onChange={(ev) => patch(i, { severity: ev.target.value as Severity })}
                  className={NATIVE_SELECT}
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
                  className={NATIVE_SELECT}
                >
                  {CATEGORIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <div className="min-w-0">
                  <Input
                    value={e.title}
                    onChange={(ev) => patch(i, { title: ev.target.value })}
                    placeholder={t("caseEditor.titleFieldPlaceholder")}
                    aria-label={t("caseEditor.titleField")}
                  />
                </div>
              </div>
            )}

            {(err.start || err.end) && (
              <div role="alert" className={FIELD_ERROR}>
                {t("caseEditor.invalidLine")}
              </div>
            )}
            {err.range && (
              <div role="alert" className={FIELD_ERROR}>
                {t("caseEditor.invalidRange")}
              </div>
            )}
            {warning && (
              <div
                role="status"
                className="flex min-w-0 items-start gap-1.5 text-xs break-words wrap-anywhere text-warn"
              >
                <Icon.AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
                <span>{warning === "file" ? t("caseEditor.warnFile") : t("caseEditor.warnLines")}</span>
              </div>
            )}
          </div>
        );
      })}

      <div>
        <Button variant="outline" size="sm" onClick={() => onChange([...entries, emptyEntry()])}>
          <Icon.Plus aria-hidden />
          {mustFind ? t("caseEditor.addFinding") : t("caseEditor.addLocation")}
        </Button>
      </div>
    </div>
  );
}
