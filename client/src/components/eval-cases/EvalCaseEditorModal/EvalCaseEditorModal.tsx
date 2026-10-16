"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { PageTabs } from "@/components/page-tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { EvalCaseKind, EvalCaseListItem, EvalOwnerKind } from "@devdigest/shared";
import { useCreateEvalCase, useRunEvalCase, useUpdateEvalCase } from "@/lib/hooks/eval-cases";
import { parseUnifiedDiff } from "@/lib/eval";
import { formatRunCost } from "@/components/run-cost-badge";
import { DiffViewer } from "@/components/diff-viewer";
import { useCaseSummaryText } from "../useCaseSummaryText";
import { addFindingSkeleton, addLocationSkeleton, parseExpectedJson, summarizeCase } from "../helpers";
import { entriesFromExpected, entriesValid, expectedFromEntries, type EntryDraft } from "./entries";
import { AdvancedJsonEditor } from "./_components/AdvancedJsonEditor";
import { ExpectedEntriesForm } from "./_components/ExpectedEntriesForm";

const TAB_KEYS = ["diff", "prMeta"] as const;

const WRAP = "min-w-0 break-words wrap-anywhere";
/** Last-run banner border per outcome. */
const BANNER_TONE = { ok: "border-ok", warn: "border-warn", crit: "border-crit" } as const;

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
  const nameId = React.useId();
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
  // The case's persisted identity (AC-54): seeded from an existing case, set
  // once the first save creates one. The ref guards the window between a click
  // and the re-render so a double Run/Save can never create twice.
  const [savedCase, setSavedCase] = React.useState<{ id: string; name: string } | null>(
    initialCase ? { id: initialCase.id, name: initialCase.name } : null,
  );
  const persistedIdRef = React.useRef<string | undefined>(initialCase?.id);
  const creatingRef = React.useRef<Promise<string> | null>(null);

  const expectedState = parseExpectedJson(expectedText);
  // Syntax validity drives the badge; array-ness is a separate block (AC-52/53).
  const jsonValid = expectedState.state !== "invalid";
  const parsedExpected = expectedState.state === "ok" ? expectedState.value : undefined;
  const formValid = entriesValid(entries);
  // The value both modes save — same shape either way (AC-46).
  const currentExpected: unknown = advanced ? parsedExpected : expectedFromEntries(entries, kind);

  const diffFiles = React.useMemo(() => parseUnifiedDiff(diff), [diff]);

  const saving = create.isPending || update.isPending;
  const running = run.isPending;
  const mustNotFlag = kind === "must_not_flag";
  const formBlocked = !advanced && !formValid;
  const jsonBlocked = advanced && expectedState.state !== "ok";
  const saveBlocked = formBlocked || jsonBlocked;
  const blockedMessage = jsonBlocked
    ? expectedState.state === "invalid"
      ? t("caseEditor.jsonInvalidBlocked")
      : t("caseEditor.jsonNotArrayBlocked")
    : t("caseEditor.saveBlocked");

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
    if (expectedState.state === "invalid") {
      setSwitchBlocked(true);
      return;
    }
    const next = entriesFromExpected(
      expectedState.state === "ok" ? expectedState.value : JSON.parse(expectedText),
      kind,
    );
    if (next.lossy && !window.confirm(t("caseEditor.lossConfirm"))) return;
    setEntries(next.entries);
    setSwitchBlocked(false);
    setAdvanced(false);
  };

  const persist = async (): Promise<string> => {
    // Blocked Advanced JSON never reaches the server (never send null).
    if (!formBlocked && advanced && parsedExpected === undefined) throw new Error("expected_output must be an array");
    const input_meta = prTitle || prBody ? { title: prTitle, body: prBody } : undefined;
    const expected_output = advanced ? parsedExpected : currentExpected;
    // A create already in flight (double click): wait for it, then update it.
    if (creatingRef.current) await creatingRef.current;
    const existingId = persistedIdRef.current;
    if (existingId) {
      const saved = await update.mutateAsync({
        id: existingId,
        patch: { name, input_diff: diff, input_meta, expected_output },
        ownerKind,
        ownerId,
      });
      setSavedCase({ id: existingId, name: saved.name ?? name });
      return existingId;
    }
    const creation = create
      .mutateAsync({
        owner_kind: ownerKind,
        owner_id: ownerId,
        name: name.trim() || t("caseEditor.namePlaceholder"),
        kind,
        input_diff: diff,
        input_meta,
        expected_output,
      })
      .then((created) => {
        persistedIdRef.current = created.id;
        setSavedCase({ id: created.id, name: created.name });
        return created.id;
      })
      .finally(() => {
        creatingRef.current = null;
      });
    creatingRef.current = creation;
    return creation;
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>
            {savedCase ? t("caseEditor.caseTitle", { name: savedCase.name }) : t("caseEditor.newCase")}
          </DialogTitle>
          <DialogDescription>{t("caseEditor.subtitle", { owner: ownerName })}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {/* minmax(0, 1fr): a bare 1fr track grows to its content's max-content (client/INSIGHTS.md 2026-09-24). */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-1 border-r border-border p-6">
              <FormField label={t("caseEditor.nameLabel")} required htmlFor={nameId}>
                <Input
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("caseEditor.namePlaceholder")}
                />
              </FormField>

              {!savedCase && (
                <FormField label={t("caseEditor.kindLabel")}>
                  <div role="radiogroup" aria-label={t("caseEditor.kindLabel")} className="flex gap-2">
                    {(["must_find", "must_not_flag"] as const).map((k) => (
                      <Button
                        key={k}
                        variant="secondary"
                        size="sm"
                        role="radio"
                        aria-checked={kind === k}
                        data-active={kind === k}
                        className="data-[active=true]:border-primary data-[active=true]:bg-brand-bg data-[active=true]:text-brand-text"
                        onClick={() => changeKind(k)}
                      >
                        {k === "must_find" ? t("caseEditor.kindMustFind") : t("caseEditor.kindMustNotFlag")}
                      </Button>
                    ))}
                  </div>
                </FormField>
              )}

              <FormField label={t("caseEditor.inputLabel")}>
                <div className="mb-4">
                  <PageTabs
                    tabs={TAB_KEYS.map((key) => ({ key, label: t(`caseEditor.tabs.${key}`) }))}
                    value={tab}
                    onChange={(k) => setTab(k as "diff" | "prMeta")}
                  />
                </div>
                {tab === "diff" ? (
                  <>
                    <Textarea
                      value={diff}
                      onChange={(e) => setDiff(e.target.value)}
                      rows={7}
                      className="mono field-sizing-fixed resize-y"
                      placeholder={t("caseEditor.diffPlaceholder")}
                    />
                    {diffFiles.length > 0 && (
                      // The diff viewer deliberately keeps nowrap + horizontal scroll (code reads wrong when wrapped).
                      <div
                        role="region"
                        aria-label={t("caseEditor.diffPreview")}
                        className="mt-2.5 max-h-65 min-w-0 overflow-auto"
                      >
                        <DiffViewer files={diffFiles} />
                      </div>
                    )}
                    {diff.trim() && diffFiles.length === 0 && (
                      <div className="mt-2 text-xs wrap-anywhere text-subtle-foreground">
                        {t("caseEditor.diffUnparsed")}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <FormField label={t("caseEditor.titleLabel")}>
                      <Input
                        value={prTitle}
                        onChange={(e) => setPrTitle(e.target.value)}
                        placeholder={t("caseEditor.titlePlaceholder")}
                      />
                    </FormField>
                    <FormField label={t("caseEditor.bodyLabel")}>
                      <Textarea
                        value={prBody}
                        onChange={(e) => setPrBody(e.target.value)}
                        rows={4}
                        className="field-sizing-fixed resize-y"
                        placeholder={t("caseEditor.bodyPlaceholder")}
                      />
                    </FormField>
                  </>
                )}
              </FormField>
            </div>

            <div className="flex min-w-0 flex-col gap-3 p-6">
              <FormField
                label={mustNotFlag ? t("caseEditor.forbiddenLocations") : t("caseEditor.expectedOutput")}
                right={
                  <label className="flex items-center gap-2 text-ui text-muted-foreground">
                    <Switch size="sm" checked={advanced} onCheckedChange={toggleAdvanced} />
                    {t("caseEditor.advanced")}
                  </label>
                }
              >
                {edited && (
                  <div
                    role="status"
                    className="mb-2 flex items-start gap-2 rounded-[7px] border border-warn px-2.5 py-2 text-ui wrap-anywhere text-warn"
                  >
                    <Icon.AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                    <span>{t("caseEditor.notComparable")}</span>
                  </div>
                )}
                {advanced ? (
                  <>
                    <AdvancedJsonEditor
                      kind={kind}
                      value={expectedText}
                      valid={jsonValid}
                      hintId={jsonBlocked ? blockedId : undefined}
                      onChange={(v) => {
                        setExpectedText(v);
                        setSwitchBlocked(false);
                      }}
                      onAddSkeleton={() =>
                        setExpectedText(
                          mustNotFlag ? addLocationSkeleton(expectedText) : addFindingSkeleton(expectedText),
                        )
                      }
                    />
                    {switchBlocked && !jsonValid && (
                      <div role="alert" className="mt-1.5 text-xs wrap-anywhere text-crit">
                        {t("caseEditor.switchBlocked")}
                      </div>
                    )}
                  </>
                ) : (
                  <ExpectedEntriesForm
                    kind={kind}
                    entries={entries}
                    onChange={setEntries}
                    diff={diff}
                    diffFiles={diffFiles}
                  />
                )}
              </FormField>

              {lastRun && (
                <div
                  role="status"
                  data-tone={bannerTone}
                  className={cn(
                    "rounded-lg border px-3.5 py-2.5 text-sm text-muted-foreground",
                    WRAP,
                    BANNER_TONE[bannerTone],
                  )}
                >
                  <strong>{bannerTitle}</strong>
                  {summaryText && <span> · {summaryText}</span>}
                  {lastRun.duration_ms != null && <span> · {(lastRun.duration_ms / 1000).toFixed(1)}s</span>}
                  {lastRun.cost_usd != null && <span> · {formatRunCost(lastRun.cost_usd)}</span>}
                </div>
              )}
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="items-center sm:justify-start">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch size="sm" checked={runOnSave} onCheckedChange={setRunOnSave} />
            {t("caseEditor.runOnSave")}
          </label>
          {saveBlocked && (
            <span id={blockedId} className="text-xs wrap-anywhere text-crit">
              {blockedMessage}
            </span>
          )}
          <div className="ml-auto flex gap-2.5">
            <Button variant="outline" onClick={onClose}>
              {t("caseEditor.cancel")}
            </Button>
            <Button
              variant="secondary"
              onClick={handleRunCase}
              disabled={saving || running || saveBlocked}
              title={saveBlocked ? blockedMessage : undefined}
              aria-describedby={saveBlocked ? blockedId : undefined}
            >
              <Icon.Play aria-hidden />
              {running ? t("caseEditor.running") : t("caseEditor.runCase")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || running || saveBlocked}
              title={saveBlocked ? blockedMessage : undefined}
              aria-describedby={saveBlocked ? blockedId : undefined}
            >
              <Icon.Check aria-hidden />
              {saving ? t("caseEditor.saving") : t("caseEditor.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
