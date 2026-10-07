"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { SkillEvalCompare } from "@devdigest/shared";
import { useSkillEvalCompare } from "@/lib/hooks/eval-runs";
import { useRestoreSkillVersion } from "@/lib/hooks/skills";
import { CompareFlags, CompareMetricCards, PromoteConfirm, TextDiffBlock } from "@/components/eval-dashboard";
import { s } from "./styles";

/** Compare two suite runs of one skill: old → new metric cards (cost rise is
 *  red), skill-text line diff, provider/model before → after with a "model
 *  changed" note, case-set / edited-case flags, and "Promote vNew" (the
 *  existing skill-version Restore) with a confirmation. The skill text is
 *  rendered as plain text, never HTML. */
export function SkillCompareRunsModal({
  skillId,
  runIds,
  currentVersion,
  onClose,
  onPromoted,
}: {
  skillId: string;
  runIds: [string, string];
  /** The skill's current version — Promote is hidden when the newer run already is it. */
  currentVersion: number | undefined;
  onClose: () => void;
  onPromoted: (version: number) => void;
}) {
  const t = useTranslations("evalSkill");
  const { data, isLoading, isError, refetch } = useSkillEvalCompare(skillId, runIds[0], runIds[1]);
  const restore = useRestoreSkillVersion();
  const [confirming, setConfirming] = React.useState(false);

  const oldV = data?.old.run.skill_version;
  const newV = data?.new.run.skill_version;
  const isCurrent = newV != null && newV === currentVersion;

  const doPromote = () => {
    if (newV == null) return;
    restore.mutate(
      { id: skillId, version: newV },
      {
        onSuccess: (skill) => {
          onPromoted(skill.version);
          onClose();
        },
      },
    );
  };

  return (
    <Modal width={900} onClose={onClose}>
      <Modal.Header
        title={data ? t("compare.title", { old: oldV ?? "?", new: newV ?? "?" }) : t("compare.title", { old: "…", new: "…" })}
        subtitle={data ? t("compare.subtitle", { cases: data.new.run.cases_total }) : undefined}
        onClose={onClose}
      />
      <div style={s.body}>
        {isLoading && <Skeleton height={220} />}
        {isError && <ErrorState body={t("compare.loadFailed")} onRetry={() => refetch()} />}
        {data && <CompareBody data={data} />}
      </div>
      <Modal.Footer>
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            {t("compare.close")}
          </Button>
          {data && newV != null && !isCurrent && !confirming && (
            <Button kind="primary" icon="GitBranch" onClick={() => setConfirming(true)}>
              {t("compare.promote", { version: newV })}
            </Button>
          )}
          {data && isCurrent && <span style={s.footerNote}>{t("compare.alreadyCurrent", { version: newV! })}</span>}
        </div>
        {confirming && data && newV != null && (
          <PromoteConfirm
            title={t("compare.confirmTitle", { version: newV })}
            body={t("compare.confirmBody", { version: newV })}
            confirmLabel={t("compare.confirm")}
            pendingLabel={t("compare.promoting")}
            cancelLabel={t("compare.cancel")}
            pending={restore.isPending}
            error={restore.error ? t("compare.failed", { message: restore.error.message }) : null}
            onConfirm={doPromote}
            onCancel={() => {
              restore.reset();
              setConfirming(false);
            }}
          />
        )}
      </Modal.Footer>
    </Modal>
  );
}

const providerModel = (run: { provider: string | null; model: string | null }) =>
  run.provider || run.model ? [run.provider, run.model].filter(Boolean).join("/") : "—";

function CompareBody({ data }: { data: SkillEvalCompare }) {
  const t = useTranslations("evalSkill");
  const tm = useTranslations("evalMetrics");
  const oldV = data.old.run.skill_version;
  const newV = data.new.run.skill_version;
  const missing = data.old.skill_text == null || data.new.skill_text == null;

  return (
    <>
      <CompareMetricCards oldRun={data.old.run} newRun={data.new.run} deltas={data.deltas} />
      <CompareFlags caseSetsDiffer={data.case_sets_differ} editedCases={data.edited_cases} />

      {missing ? (
        <div>
          <div style={s.sectionLabel}>
            <Icon.FileText size={14} />
            {t("compare.skillTextDiff")}
          </div>
          <div style={s.muted}>{t("compare.snapshotMissing", { version: data.old.skill_text == null ? (oldV ?? "?") : (newV ?? "?") })}</div>
        </div>
      ) : (
        <TextDiffBlock
          title={t("compare.skillTextDiff")}
          oldText={data.old.skill_text ?? ""}
          newText={data.new.skill_text ?? ""}
          oldLabel={tm("compare.legendOld", { version: oldV ?? "?" })}
          newLabel={tm("compare.legendNew", { version: newV ?? "?" })}
        />
      )}

      <div>
        <div style={s.sectionLabel}>
          <Icon.Cpu size={14} />
          {t("compare.modelTitle")}
        </div>
        <div style={s.modelRow}>
          <strong>{t("compare.modelLabel")}: </strong>
          <span className="mono" style={s.modelValue}>
            {providerModel(data.old.run)}
          </span>
          <Icon.ArrowRight size={13} style={s.arrow} />
          <span className="mono" style={s.modelValue}>
            {providerModel(data.new.run)}
          </span>
          {data.model_changed && <span style={s.modelNote}>{t("compare.modelChanged")}</span>}
        </div>
      </div>
    </>
  );
}
