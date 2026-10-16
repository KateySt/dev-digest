"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { SkillEvalCompare } from "@devdigest/shared";
import { useSkillEvalCompare } from "@/lib/hooks/eval-runs";
import { useRestoreSkillVersion } from "@/lib/hooks/skills";
import { CompareFlags, CompareMetricCards, PromoteConfirm, TextDiffBlock } from "@/components/eval-dashboard";
import { cn } from "@/lib/utils";

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>
            {data
              ? t("compare.title", { old: oldV ?? "?", new: newV ?? "?" })
              : t("compare.title", { old: "…", new: "…" })}
          </DialogTitle>
          {data && <DialogDescription>{t("compare.subtitle", { cases: data.new.run.cases_total })}</DialogDescription>}
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5 p-6">
          {isLoading && <Skeleton className="h-55 w-full" />}
          {isError && <ErrorState body={t("compare.loadFailed")} onRetry={() => refetch()} />}
          {data && <CompareBody data={data} />}
        </DialogBody>
        <DialogFooter className="flex-col gap-0 sm:flex-col sm:justify-start">
          <div className="flex items-center gap-2.5">
            <Button variant="secondary" onClick={onClose}>
              {t("compare.close")}
            </Button>
            {data && newV != null && !isCurrent && !confirming && (
              <Button onClick={() => setConfirming(true)}>
                <Icon.GitBranch aria-hidden />
                {t("compare.promote", { version: newV })}
              </Button>
            )}
            {data && isCurrent && (
              <span className="ml-auto text-ui text-subtle-foreground">
                {t("compare.alreadyCurrent", { version: newV! })}
              </span>
            )}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Provider/model strings wrap (client/INSIGHTS.md 2026-09-24). */
const WRAP = "min-w-0 break-words wrap-anywhere";
const SECTION_LABEL =
  "mb-2.5 flex items-center gap-2 text-xs font-bold tracking-[0.07em] text-subtle-foreground uppercase";

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
          <div className={SECTION_LABEL}>
            <Icon.FileText size={14} aria-hidden />
            {t("compare.skillTextDiff")}
          </div>
          <div className="text-sm text-subtle-foreground">
            {t("compare.snapshotMissing", { version: data.old.skill_text == null ? (oldV ?? "?") : (newV ?? "?") })}
          </div>
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
        <div className={SECTION_LABEL}>
          <Icon.Cpu size={14} aria-hidden />
          {t("compare.modelTitle")}
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm",
            WRAP,
          )}
        >
          <strong>{t("compare.modelLabel")}: </strong>
          <span className={cn("mono", WRAP)}>{providerModel(data.old.run)}</span>
          <Icon.ArrowRight size={13} className="shrink-0 text-subtle-foreground" aria-hidden />
          <span className={cn("mono", WRAP)}>{providerModel(data.new.run)}</span>
          {data.model_changed && (
            <span className="rounded-md border border-warn px-2.25 py-0.5 text-ui text-warn">
              {t("compare.modelChanged")}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
