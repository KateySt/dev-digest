"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, Modal, Tabs, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { EvalCaseKind, EvalCaseListItem, EvalOwnerKind } from "@devdigest/shared";
import { useAgent } from "@/lib/hooks/agents";
import { useCreateEvalCase, useRunEvalCase, useUpdateEvalCase } from "@/lib/hooks/eval-cases";
import { formatRunCost } from "@/components/run-cost-badge";
import { addFindingSkeleton, addLocationSkeleton, summarizeCase, tryParseJson } from "../../helpers";
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
 *  cases. Editing the diff or expected output of a case that already has a
 *  result shows a "not directly comparable" warning. */
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
  const { data: agent } = useAgent(ownerKind === "agent" ? ownerId : null);

  const initialMeta = (initialCase?.input_meta ?? {}) as InputMeta;
  const initialExpectedText = JSON.stringify(initialCase?.expected_output ?? [], null, 2);
  const [name, setName] = React.useState(initialCase?.name ?? "");
  const [kind, setKind] = React.useState<EvalCaseKind>(initialCase?.kind ?? "must_find");
  const [diff, setDiff] = React.useState(initialCase?.input_diff ?? "");
  const [prTitle, setPrTitle] = React.useState(initialMeta.title ?? "");
  const [prBody, setPrBody] = React.useState(initialMeta.body ?? "");
  const [expectedText, setExpectedText] = React.useState(initialExpectedText);
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [tab, setTab] = React.useState<"diff" | "prMeta">("diff");
  const [lastRun, setLastRun] = React.useState(initialCase?.last_run ?? null);

  const parsedExpected = tryParseJson(expectedText);
  const jsonValid = parsedExpected !== null;

  const saving = create.isPending || update.isPending;
  const running = run.isPending;
  const mustNotFlag = kind === "must_not_flag";

  // Derived (not stored): inputs changed on a case that already has a result.
  const edited =
    !!initialCase?.last_run &&
    (diff !== (initialCase.input_diff ?? "") ||
      JSON.stringify(parsedExpected) !== JSON.stringify(initialCase.expected_output ?? []));

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

  const summary = lastRun ? summarizeCase(kind, parsedExpected, lastRun) : null;
  const summaryText =
    summary?.kind === "mustFind"
      ? t("evalsTab.summary.mustFind", { expected: summary.expected, got: summary.got })
      : summary?.kind === "mustNotFlag"
        ? summary.locations
          ? t("evalsTab.summary.mustNotFlagAt", { locations: summary.locations, got: summary.got })
          : t("evalsTab.summary.mustNotFlag", { got: summary.got })
        : summary?.kind === "errored"
          ? t("evalsTab.summary.errored", { message: summary.message })
          : "";
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
        subtitle={t("caseEditor.subtitle", { agent: agent?.name ?? "" })}
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
                    onClick={() => setKind(k)}
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
                {diff && (
                  <div aria-label={t("caseEditor.diffPreview")} className="mono" style={s.diffPreview}>
                    {diff.split("\n").map((line, i) => (
                      <div key={i} style={s.diffLine(line)}>
                        {line || " "}
                      </div>
                    ))}
                  </div>
                )}
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
              <div style={s.jsonHeader}>
                <Badge color={jsonValid ? "var(--ok)" : "var(--crit)"}>
                  {jsonValid ? t("caseEditor.validJson") : t("caseEditor.invalidJson")}
                </Badge>
                <button
                  type="button"
                  style={s.skeletonBtn}
                  onClick={() => setExpectedText(mustNotFlag ? addLocationSkeleton(expectedText) : addFindingSkeleton(expectedText))}
                >
                  {mustNotFlag ? t("caseEditor.locationSkeleton") : t("caseEditor.findingSkeleton")}
                </button>
              </div>
            }
          >
            {edited && (
              <div role="status" style={s.warning}>
                <Icon.AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{t("caseEditor.notComparable")}</span>
              </div>
            )}
            <Textarea value={expectedText} onChange={setExpectedText} rows={12} mono />
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
          <div style={s.footerActions}>
            <Button kind="ghost" onClick={onClose}>
              {t("caseEditor.cancel")}
            </Button>
            <Button kind="secondary" icon="Play" onClick={handleRunCase} disabled={saving || running}>
              {running ? t("caseEditor.running") : t("caseEditor.runCase")}
            </Button>
            <Button kind="primary" icon="Check" onClick={handleSave} disabled={saving || running}>
              {saving ? t("caseEditor.saving") : t("caseEditor.save")}
            </Button>
          </div>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
