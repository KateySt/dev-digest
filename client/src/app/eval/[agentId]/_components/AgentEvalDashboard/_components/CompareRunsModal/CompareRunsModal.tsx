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
import type { AgentVersionConfig, EvalCompare } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useEvalCompare } from "@/lib/hooks/eval-runs";
import { usePromoteAgentVersion } from "@/lib/hooks/agents";
import { CompareFlags, CompareMetricCards, PromoteConfirm, TextDiffBlock } from "@/components/eval-dashboard";
import { normalizeSkills } from "@/lib/eval";

/** Compare two suite runs of one agent: old → new metric cards (cost rise is
 *  red), system-prompt line diff, model + skills before → after, case-set /
 *  edited-case flags, and "Promote vNew" with a confirmation. Everything
 *  from the server is rendered as plain text. */
export function CompareRunsModal({
  agentId,
  runIds,
  currentVersion,
  onClose,
  onPromoted,
}: {
  agentId: string;
  runIds: [string, string];
  /** The agent's current version — Promote is hidden when the newer run already is it. */
  currentVersion: number | undefined;
  onClose: () => void;
  onPromoted: (version: number) => void;
}) {
  const t = useTranslations("evalAgent");
  const { data, isLoading, isError, refetch } = useEvalCompare(agentId, runIds[0], runIds[1]);
  const promote = usePromoteAgentVersion();
  const [confirming, setConfirming] = React.useState(false);

  const oldV = data?.old.run.agent_version;
  const newV = data?.new.run.agent_version;
  const isCurrent = newV != null && newV === currentVersion;

  const doPromote = () => {
    if (newV == null) return;
    promote.mutate(
      { agentId, version: newV },
      {
        onSuccess: (agent) => {
          onPromoted(agent.version);
          onClose();
        },
      },
    );
  };

  // Promote's 409 carries the deleted skills; anything else is a plain failure.
  const error = promote.error;
  const missing =
    error instanceof ApiError && error.status === 409
      ? ((error.details as { missing_skills?: { id: string; name: string | null }[] } | undefined)?.missing_skills ??
        null)
      : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>
            {data ? t("compare.title", { old: oldV!, new: newV! }) : t("compare.title", { old: "…", new: "…" })}
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
            {data && !isCurrent && !confirming && (
              <Button onClick={() => setConfirming(true)}>
                <Icon.GitBranch aria-hidden />
                {t("compare.promote", { version: newV! })}
              </Button>
            )}
            {data && isCurrent && (
              <span className="ml-auto text-ui text-subtle-foreground">
                {t("compare.alreadyCurrent", { version: newV! })}
              </span>
            )}
          </div>
          {confirming && data && (
            <PromoteConfirm
              title={t("compare.confirmTitle", { version: newV! })}
              body={t("compare.confirmBody", { version: newV! })}
              confirmLabel={t("compare.confirm")}
              pendingLabel={t("compare.promoting")}
              cancelLabel={t("compare.cancel")}
              pending={promote.isPending}
              blocked={!!missing}
              error={
                missing
                  ? t("compare.missingSkills", { skills: missing.map((m) => m.name ?? m.id).join(", ") })
                  : error
                    ? t("compare.failed", { message: error.message })
                    : null
              }
              onConfirm={doPromote}
              onCancel={() => {
                promote.reset();
                setConfirming(false);
              }}
            />
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Long unbroken strings (skill names/ids) wrap: overflow-wrap anywhere +
 *  min-w-0 + minmax(0, 1fr) tracks (client/INSIGHTS.md 2026-09-24). */
const SECTION_LABEL =
  "mb-2.5 flex items-center gap-2 text-xs font-bold tracking-[0.07em] text-subtle-foreground uppercase";
const CONFIG_COL = "min-w-0 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm break-words wrap-anywhere";
const CONFIG_HEAD = "mb-1.5 text-xs font-bold text-subtle-foreground";
const MUTED = "text-sm text-subtle-foreground";

function CompareBody({ data }: { data: EvalCompare }) {
  const t = useTranslations("evalAgent");
  const tm = useTranslations("evalMetrics");
  const oldV = data.old.run.agent_version;
  const newV = data.new.run.agent_version;

  return (
    <>
      <CompareMetricCards oldRun={data.old.run} newRun={data.new.run} deltas={data.deltas} />
      <CompareFlags caseSetsDiffer={data.case_sets_differ} editedCases={data.edited_cases} />

      {data.old.config && data.new.config ? (
        <TextDiffBlock
          title={t("compare.promptDiff")}
          oldText={data.old.config.system_prompt ?? ""}
          newText={data.new.config.system_prompt ?? ""}
          oldLabel={tm("compare.legendOld", { version: oldV })}
          newLabel={tm("compare.legendNew", { version: newV })}
        />
      ) : (
        <div>
          <div className={SECTION_LABEL}>
            <Icon.FileText size={14} aria-hidden />
            {t("compare.promptDiff")}
          </div>
          <div className={MUTED}>{t("compare.snapshotMissing", { version: data.old.config ? newV : oldV })}</div>
        </div>
      )}

      <div>
        <div className={SECTION_LABEL}>
          <Icon.Cpu size={14} aria-hidden />
          {t("compare.configTitle")}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3.5">
          <ConfigColumn version={oldV} config={data.old.config} />
          <ConfigColumn version={newV} config={data.new.config} />
        </div>
      </div>
    </>
  );
}

function ConfigColumn({ version, config }: { version: number; config: AgentVersionConfig | null }) {
  const t = useTranslations("evalAgent");
  if (!config) {
    return (
      <div className={CONFIG_COL}>
        <div className={CONFIG_HEAD}>v{version}</div>
        <div className={MUTED}>{t("compare.snapshotMissing", { version })}</div>
      </div>
    );
  }
  const skills = normalizeSkills(config.skills);
  return (
    <div className={CONFIG_COL}>
      <div className={CONFIG_HEAD}>v{version}</div>
      <div>
        <strong>{t("compare.model")}: </strong>
        <span className="mono">
          {config.provider}/{config.model}
        </span>
      </div>
      <div className="mt-1.5">
        <strong>{t("compare.skills")}: </strong>
        {skills.length === 0 ? (
          <span className={MUTED}>{t("compare.noSkills")}</span>
        ) : (
          <ul className="m-0 pl-4.5 text-muted-foreground">
            {skills.map((sk) => (
              <li key={sk.id} className="mono">
                {sk.name ?? sk.id}
                {sk.version != null ? ` v${sk.version}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
