"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, Modal, Tabs, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { EvalCaseKind, EvalCaseListItem, EvalOwnerKind } from "@devdigest/shared";
import { useCreateEvalCase, useRunEvalCase, useUpdateEvalCase } from "@/lib/hooks/eval-cases";
import { parseUnifiedDiff } from "@/lib/eval";
import { formatRunCost } from "@/components/run-cost-badge";
import { DiffViewer } from "@/components/diff-viewer";
import { useCaseSummaryText } from "../useCaseSummaryText";
import { addFindingSkeleton, addLocationSkeleton, summarizeCase, tryParseJson } from "../helpers";
import { entriesFromExpected, entriesValid, expectedFromEntries, type EntryDraft } from "./entries";
import { AdvancedJsonEditor } from "./_components/AdvancedJsonEditor";
import { ExpectedEntriesForm } from "./_components/ExpectedEntriesForm";
import { s } from "./styles";

const TABS = [
  { key: "diff", label: "Diff" },
  { key: "prMeta", label: "PR meta" },
];

interface InputMeta {
  title?: string;
  body?: string;
}

/** Create/edit an eval case. "Save" persists; "Run case" persists THEN runs
 *  immediately (so it always runs the latest edits, not a stale save); the
 *  "Run on save" toggle makes plain "Save" behave like "Run case" too.
 *
 *  New cases pick a kind (must find / must not flag) and are saved as manual
 *  cases. The expected output is edited as a structured list by default, with
 *  the raw JSON behind an "Advanced" toggle; both modes save the same shape.
 *  Editing the diff or expected output of a case that already has a result
 *  shows a "not directly comparable" warning. */
export function EvalCaseEditorModal({
  ownerKind,
  ownerId,
  ownerName,
  initialCase,
  onClose,
}: {
  ownerKind: EvalOwnerKind;
  ownerId: string;
  /** Display name of the owning agent/skill, shown in the modal subtitle. */
  ownerName: string;
  initialCase?: EvalCaseListItem;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const blockedId = React.useId();
  const summaryToText = useCaseSummaryText();
  const create = useCreateEvalCase();
  const update = useUpdateEvalCase();
  const run = useRunEvalCase();

  const initialMeta = (initialCase?.input_meta ?? {}) as InputMeta;
  const initialKind: EvalCaseKind = initialCase?.kind ?? "must_find";
  const initialExpected = initialCase?.expected_output ?? [];
  // An existing case the form can't represent faithfully opens in Advanced so
  // saving never silently drops fields.
  const initialForm = React.useMemo(() => entriesFromExpected(initialExpected, initialKind), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [name, setName] = React.useState(initialCase?.name ?? "");
  const [kind, setKind] = React.useState<EvalCaseKind>(initialKind);
  const [diff, setDiff] = React.useState(initialCase?.input_diff ?? "");
  const [prTitle, setPrTitle] = React.useState(initialMeta.title ?? "");
  const [prBody, setPrBody] = React.useState(initialMeta.body ?? "");
  const [advanced, setAdvanced] = React.useState(initialForm.lossy);
  const [entries, setEntries] = React.useState<EntryDraft[]>(initialForm.entries);
  const [expectedText, setExpectedText] = React.useState(JSON.stringify(initialExpected, null, 2));
  const [switchBlocked, setSwitchBlocked] = React.useState(false);
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [tab, setTab] = React.useState<"diff" | "prMeta">("diff");
  const [lastRun, setLastRun] = React.useState(initialCase?.last_run ?? null);

  const parsedExpected = tryParseJson(expectedText);
  const jsonValid = parsedExpected !== null;
  const formValid = entriesValid(entries);
  // The value both modes save — same shape either way (AC-46).
  const currentExpected: unknown = advanced ? parsedExpected : expectedFromEntries(entries, kind);

  const diffFiles = React.useMemo(() => parseUnifiedDiff(diff), [diff]);

  const saving = create.isPending || update.isPending;
  const running = run.isPending;
  const mustNotFlag = kind === "must_not_flag";
  const saveBlocked = !advanced && !formValid;

  // Derived (not stored): inputs changed on a case that already has a result.
  // The baseline is normalised through the form model so opening a case whose
  // stored output merely lacks `end_line` isn't reported as an edit.
  const baseline = initialForm.lossy ? initialExpected : expectedFromEntries(initialForm.entries, initialKind);
  const edited =
    !!initialCase?.last_run &&
    (diff !== (initialCase.input_diff ?? "") || JSON.stringify(currentExpected) !== JSON.stringify(baseline));

  const changeKind = (k: EvalCaseKind) => {
    setKind(k);
    // Entries from one kind aren't meaningful for the other; start the list over.
    setEntries([]);
  };

  const toggleAdvanced = () => {
    if (!advanced) {
      setExpectedText(JSON.stringify(expectedFromEntries(entries, kind), null, 2));
      setSwitchBlocked(false);
      setAdvanced(true);
      return;
    }
    // Advanced → form: invalid JSON can't be shown (AC-49); fields the form
    // has no input for are lost, so confirm first (AC-50).
    if (!jsonValid) {
      setSwitchBlocked(true);
      return;
    }
    const next = entriesFromExpected(parsedExpected, kind);
    if (next.lossy && !window.confirm(t("caseEditor.lossConfirm"))) return;
    setEntries(next.entries);
    setSwitchBlocked(false);
    setAdvanced(false);
  };

  const persist = async (): Promise<string> => {
    const input_meta = prTitle || prBody ? { title: prTitle, body: prBody } : undefined;
    const expected_output = advanced ? (jsonValid ? parsedExpected : null) : currentExpected;
    if (initialCase) {
      const saved = await update.mutateAsync({
        id: initialCase.id,
        patch: { name, input_diff: diff, input_meta, expected_output },
        ownerKind,
        ownerId,
      });
      return saved.id;
    }
    const created = await create.mutateAsync({
      owner_kind: ownerKind,
      owner_id: ownerId,
      name: name.trim() || t("caseEditor.namePlaceholder"),
      kind,
      input_diff: diff,
      input_meta,
      expected_output,
    });
    return created.id;
  };

  const handleSave = async () => {
    const id = await persist();
    if (runOnSave) {
      const result = await run.mutateAsync({ id, ownerKind, ownerId });
      setLastRun(result);
    } else {
      onClose();
    }
  };

  const handleRunCase = async () => {
    const id = await persist();
    const result = await run.mutateAsync({ id, ownerKind, ownerId });
    setLastRun(result);
  };

  const summary = lastRun ? summarizeCase(kind, currentExpected, lastRun) : null;
  const summaryText = summary ? summaryToText(summary) : "";
  const bannerTone = !lastRun ? "ok" : lastRun.status === "errored" ? "warn" : lastRun.pass ? "ok" : "crit";
  const bannerTitle = !lastRun
    ? ""
    : lastRun.status === "errored"
      ? t("caseEditor.lastRunErrored")
      : lastRun.pass
        ? t("caseEditor.lastRunPassed")
        : t("caseEditor.lastRunFailed");

  return (
    <Modal width={960} onClose={onClose}>
      <Modal.Header
        title={initialCase ? t("caseEditor.caseTitle", { name: initialCase.name }) : t("caseEditor.newCase")}
        subtitle={t("caseEditor.subtitle", { owner: ownerName })}
        onClose={onClose}
      />
      <div style={s.columns}>
        <div style={s.left}>
          <FormField label={t("caseEditor.nameLabel")} required>
            <TextInput value={name} onChange={setName} placeholder={t("caseEditor.namePlaceholder")} />
          </FormField>

          {!initialCase && (
            <FormField label={t("caseEditor.kindLabel")}>
              <div role="radiogroup" aria-label={t("caseEditor.kindLabel")} style={s.kindRow}>
                {(["must_find", "must_not_flag"] as const).map((k) => (
                  <Button
                    key={k}
                    kind="secondary"
                    size="sm"
                    role="radio"
                    aria-checked={kind === k}
                    active={kind === k}
                    onClick={() => changeKind(k)}
                  >
                    {k === "must_find" ? t("caseEditor.kindMustFind") : t("caseEditor.kindMustNotFlag")}
                  </Button>
                ))}
              </div>
            </FormField>
          )}

          <FormField label={t("caseEditor.inputLabel")}>
            <div style={s.tabsWrap}>
              <Tabs tabs={TABS} value={tab} onChange={(k) => setTab(k as "diff" | "prMeta")} pad="0" />
            </div>
            {tab === "diff" ? (
              <>
                <Textarea value={diff} onChange={setDiff} rows={7} mono placeholder={t("caseEditor.diffPlaceholder")} />
                {diffFiles.length > 0 && (
                  <div role="region" aria-label={t("caseEditor.diffPreview")} style={s.diffPreview}>
                    <DiffViewer files={diffFiles} />
                  </div>
                )}
                {diff.trim() && diffFiles.length === 0 && <div style={s.diffHint}>{t("caseEditor.diffUnparsed")}</div>}
              </>
            ) : (
              <>
                <FormField label={t("caseEditor.titleLabel")}>
                  <TextInput value={prTitle} onChange={setPrTitle} placeholder={t("caseEditor.titlePlaceholder")} />
                </FormField>
                <FormField label={t("caseEditor.bodyLabel")}>
                  <Textarea value={prBody} onChange={setPrBody} rows={4} placeholder={t("caseEditor.bodyPlaceholder")} />
                </FormField>
              </>
            )}
          </FormField>
        </div>

        <div style={s.right}>
          <FormField
            label={mustNotFlag ? t("caseEditor.forbiddenLocations") : t("caseEditor.expectedOutput")}
            right={
              <label style={s.advancedToggle}>
                <Toggle on={advanced} onChange={toggleAdvanced} size={14} />
                {t("caseEditor.advanced")}
              </label>
            }
          >
            {edited && (
              <div role="status" style={s.warning}>
                <Icon.AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{t("caseEditor.notComparable")}</span>
              </div>
            )}
            {advanced ? (
              <>
                <AdvancedJsonEditor
                  kind={kind}
                  value={expectedText}
                  valid={jsonValid}
                  onChange={(v) => {
                    setExpectedText(v);
                    setSwitchBlocked(false);
                  }}
                  onAddSkeleton={() =>
                    setExpectedText(mustNotFlag ? addLocationSkeleton(expectedText) : addFindingSkeleton(expectedText))
                  }
                />
                {switchBlocked && !jsonValid && (
                  <div role="alert" style={s.modeHint}>
                    {t("caseEditor.switchBlocked")}
                  </div>
                )}
              </>
            ) : (
              <ExpectedEntriesForm kind={kind} entries={entries} onChange={setEntries} diff={diff} diffFiles={diffFiles} />
            )}
          </FormField>

          {lastRun && (
            <div role="status" style={s.banner(bannerTone)}>
              <strong>{bannerTitle}</strong>
              {summaryText && <span> · {summaryText}</span>}
              {lastRun.duration_ms != null && <span> · {(lastRun.duration_ms / 1000).toFixed(1)}s</span>}
              {lastRun.cost_usd != null && <span> · {formatRunCost(lastRun.cost_usd)}</span>}
            </div>
          )}
        </div>
      </div>

      <Modal.Footer>
        <div style={s.footer}>
          <label style={s.runOnSave}>
            <Toggle on={runOnSave} onChange={setRunOnSave} size={14} />
            {t("caseEditor.runOnSave")}
          </label>
          {saveBlocked && (
            <span id={blockedId} style={s.saveHint}>
              {t("caseEditor.saveBlocked")}
            </span>
          )}
          <div style={s.footerActions}>
            <Button kind="ghost" onClick={onClose}>
              {t("caseEditor.cancel")}
            </Button>
            <Button kind="secondary" icon="Play" onClick={handleRunCase}
              disabled={saving || running || saveBlocked}
              title={saveBlocked ? t("caseEditor.saveBlocked") : undefined}
              aria-describedby={saveBlocked ? blockedId : undefined}
            >
              {running ? t("caseEditor.running") : t("caseEditor.runCase")}
            </Button>
            <Button kind="primary" icon="Check" onClick={handleSave}
              disabled={saving || running || saveBlocked}
              title={saveBlocked ? t("caseEditor.saveBlocked") : undefined}
              aria-describedby={saveBlocked ? blockedId : undefined}
            >
              {saving ? t("caseEditor.saving") : t("caseEditor.save")}
            </Button>
          </div>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
