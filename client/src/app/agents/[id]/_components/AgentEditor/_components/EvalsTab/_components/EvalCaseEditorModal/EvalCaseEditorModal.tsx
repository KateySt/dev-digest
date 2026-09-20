"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Modal, Tabs, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { EvalCaseListItem, EvalOwnerKind } from "@devdigest/shared";
import {
  useCreateEvalCase,
  useRunEvalCase,
  useUpdateEvalCase,
} from "../../../../../../../../../lib/hooks/eval-cases";
import { addFindingSkeleton, tryParseJson } from "../../helpers";
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
 *  "Run on save" toggle makes plain "Save" behave like "Run case" too. */
export function EvalCaseEditorModal({
  ownerKind,
  ownerId,
  initialCase,
  onClose,
}: {
  ownerKind: EvalOwnerKind;
  ownerId: string;
  initialCase?: EvalCaseListItem;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const create = useCreateEvalCase();
  const update = useUpdateEvalCase();
  const run = useRunEvalCase();

  const initialMeta = (initialCase?.input_meta ?? {}) as InputMeta;
  const [name, setName] = React.useState(initialCase?.name ?? "");
  const [diff, setDiff] = React.useState(initialCase?.input_diff ?? "");
  const [prTitle, setPrTitle] = React.useState(initialMeta.title ?? "");
  const [prBody, setPrBody] = React.useState(initialMeta.body ?? "");
  const [expectedText, setExpectedText] = React.useState(
    JSON.stringify(initialCase?.expected_output ?? [], null, 2),
  );
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [tab, setTab] = React.useState<"diff" | "prMeta">("diff");
  const [lastRun, setLastRun] = React.useState(initialCase?.last_run ?? null);

  const parsedExpected = tryParseJson(expectedText);
  const jsonValid = parsedExpected !== null;

  const saving = create.isPending || update.isPending;
  const running = run.isPending;

  const persist = async (): Promise<string> => {
    const input_meta = prTitle || prBody ? { title: prTitle, body: prBody } : undefined;
    const expected_output = jsonValid ? parsedExpected : null;
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

  return (
    <Modal width={760} onClose={onClose}>
      <Modal.Header
        title={initialCase ? t("caseEditor.caseTitle", { name: initialCase.name }) : t("caseEditor.newCase")}
        onClose={onClose}
      />
      <div style={s.body}>
        <FormField label={t("caseEditor.nameLabel")} required>
          <TextInput value={name} onChange={setName} placeholder={t("caseEditor.namePlaceholder")} />
        </FormField>

        <FormField label={t("caseEditor.inputLabel")}>
          <div style={s.tabsWrap}>
            <Tabs tabs={TABS} value={tab} onChange={(k) => setTab(k as "diff" | "prMeta")} pad="0" />
          </div>
          {tab === "diff" ? (
            <Textarea value={diff} onChange={setDiff} rows={10} mono placeholder={t("caseEditor.diffPlaceholder")} />
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

        <FormField
          label={t("caseEditor.expectedOutput")}
          right={
            <div style={s.jsonHeader}>
              <Badge color={jsonValid ? "var(--ok)" : "var(--crit)"}>
                {jsonValid ? t("caseEditor.validJson") : t("caseEditor.invalidJson")}
              </Badge>
              <button style={s.skeletonBtn} onClick={() => setExpectedText(addFindingSkeleton(expectedText))}>
                + Finding skeleton
              </button>
            </div>
          }
        >
          <Textarea value={expectedText} onChange={setExpectedText} rows={8} mono />
        </FormField>
      </div>

      <Modal.Footer>
        <div style={s.footer}>
          <label style={s.runOnSave}>
            <Toggle on={runOnSave} onChange={setRunOnSave} size={14} />
            Run on save
          </label>
          {lastRun && (
            <span style={s.resultNote}>
              {lastRun.pass ? t("caseEditor.lastRunPassed") : t("caseEditor.lastRunFailed")}
              {lastRun.recall != null && lastRun.duration_ms != null && (
                <>
                  {" · "}
                  {t("caseEditor.resultSummary", {
                    recall: Math.round((lastRun.recall ?? 0) * 100),
                    precision: Math.round((lastRun.precision ?? 0) * 100),
                    citation: Math.round((lastRun.citation_accuracy ?? 0) * 100),
                    duration: (lastRun.duration_ms / 1000).toFixed(1),
                  })}
                </>
              )}
            </span>
          )}
          <Button kind="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button kind="secondary" icon="Play" onClick={handleRunCase} disabled={saving || running}>
            {running ? t("caseEditor.running") : t("caseEditor.runCase")}
          </Button>
          <Button kind="primary" icon="Check" onClick={handleSave} disabled={saving || running}>
            {saving ? t("caseEditor.saving") : t("caseEditor.save")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
