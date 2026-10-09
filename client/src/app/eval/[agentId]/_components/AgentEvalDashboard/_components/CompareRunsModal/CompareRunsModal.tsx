"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { AgentVersionConfig, EvalCompare } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useEvalCompare } from "@/lib/hooks/eval-runs";
import { usePromoteAgentVersion } from "@/lib/hooks/agents";
import { CompareFlags, CompareMetricCards, PromoteConfirm, TextDiffBlock } from "@/components/eval-dashboard";
import { normalizeSkills } from "@/lib/eval";
import { s } from "./styles";

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
      ? ((error.details as { missing_skills?: { id: string; name: string | null }[] } | undefined)?.missing_skills ?? null)
      : null;

  return (
    <Modal width={900} onClose={onClose}>
      <Modal.Header
        title={data ? t("compare.title", { old: oldV!, new: newV! }) : t("compare.title", { old: "…", new: "…" })}
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
          {data && !isCurrent && !confirming && (
            <Button kind="primary" icon="GitBranch" onClick={() => setConfirming(true)}>
              {t("compare.promote", { version: newV! })}
            </Button>
          )}
          {data && isCurrent && <span style={s.footerNote}>{t("compare.alreadyCurrent", { version: newV! })}</span>}
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
      </Modal.Footer>
    </Modal>
  );
}

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
          <div style={s.sectionLabel}>
            <Icon.FileText size={14} />
            {t("compare.promptDiff")}
          </div>
          <div style={s.muted}>{t("compare.snapshotMissing", { version: data.old.config ? newV : oldV })}</div>
        </div>
      )}

      <div>
        <div style={s.sectionLabel}>
          <Icon.Cpu size={14} />
          {t("compare.configTitle")}
        </div>
        <div style={s.config}>
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
      <div style={s.configCol}>
        <div style={s.configHead}>v{version}</div>
        <div style={s.muted}>{t("compare.snapshotMissing", { version })}</div>
      </div>
    );
  }
  const skills = normalizeSkills(config.skills);
  return (
    <div style={s.configCol}>
      <div style={s.configHead}>v{version}</div>
      <div>
        <strong>{t("compare.model")}: </strong>
        <span className="mono">
          {config.provider}/{config.model}
        </span>
      </div>
      <div style={{ marginTop: 6 }}>
        <strong>{t("compare.skills")}: </strong>
        {skills.length === 0 ? (
          <span style={s.muted}>{t("compare.noSkills")}</span>
        ) : (
          <ul style={s.configList}>
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
