"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { AgentVersionConfig, EvalCompare } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useEvalCompare } from "@/lib/hooks/eval-runs";
import { usePromoteAgentVersion } from "@/lib/hooks/agents";
import { MetricDelta, MetricValue } from "@/components/eval-metrics";
import { formatRunCost } from "@/components/run-cost-badge";
import {
  METRICS,
  deltaColor,
  formatPercent,
  collapseDiff,
  lineDiff,
  normalizeSkills,
} from "@/lib/eval";
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
            version={newV!}
            pending={promote.isPending}
            error={promote.error}
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

function PromoteConfirm({
  version,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  version: number;
  pending: boolean;
  error: Error | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("evalAgent");
  const missing =
    error instanceof ApiError && error.status === 409
      ? ((error.details as { missing_skills?: { id: string; name: string | null }[] } | undefined)?.missing_skills ?? null)
      : null;

  return (
    <div role="alertdialog" aria-label={t("compare.confirmTitle", { version })} style={{ ...s.confirm, marginTop: 14 }}>
      <strong>{t("compare.confirmTitle", { version })}</strong>
      <p style={{ margin: "6px 0 10px" }}>{t("compare.confirmBody", { version })}</p>
      {missing && (
        <p role="alert" style={s.error}>
          {t("compare.missingSkills", { skills: missing.map((m) => m.name ?? m.id).join(", ") })}
        </p>
      )}
      {error && !missing && (
        <p role="alert" style={s.error}>
          {t("compare.failed", { message: error.message })}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Button kind="primary" size="sm" onClick={onConfirm} loading={pending} disabled={!!missing}>
          {pending ? t("compare.promoting") : t("compare.confirm")}
        </Button>
        <Button kind="ghost" size="sm" onClick={onCancel} disabled={pending}>
          {t("compare.cancel")}
        </Button>
      </div>
    </div>
  );
}

function CompareBody({ data }: { data: EvalCompare }) {
  const t = useTranslations("evalAgent");
  const oldV = data.old.run.agent_version;
  const newV = data.new.run.agent_version;
  const oldPrompt = data.old.config?.system_prompt ?? "";
  const newPrompt = data.new.config?.system_prompt ?? "";
  const diff = React.useMemo(() => collapseDiff(lineDiff(oldPrompt, newPrompt)), [oldPrompt, newPrompt]);
  const cost = data.deltas.cost_usd;
  const costDir = cost == null ? "flat" : cost > 0 ? "up" : cost < 0 ? "down" : "flat";

  return (
    <>
      <div style={s.cards}>
        {METRICS.map((m) => (
          <div key={m.key} style={s.card}>
            <div style={s.cardLabel}>{t(`metrics.${m.key}`).toUpperCase()}</div>
            <div style={s.cardRow}>
              <span className="tnum" style={s.oldValue}>
                {formatPercent(data.old.run[m.key])}%
              </span>
              <Icon.ArrowRight size={13} style={s.arrow} />
              <MetricValue value={data.new.run[m.key]} color={m.color} size={26} />
              <MetricDelta delta={data.deltas[m.key]} />
            </div>
          </div>
        ))}
        <div style={s.card}>
          <div style={s.cardLabel}>{t("compare.cost")}</div>
          <div style={s.cardRow}>
            <span className="tnum" style={s.oldValue}>
              {data.old.run.cost_usd != null ? formatRunCost(data.old.run.cost_usd) : "—"}
            </span>
            <Icon.ArrowRight size={13} style={s.arrow} />
            <span className="tnum" style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>
              {data.new.run.cost_usd != null ? formatRunCost(data.new.run.cost_usd) : "—"}
            </span>
            {cost != null && costDir !== "flat" && (
              // Cost is inverted: a rise is red, a drop green.
              <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: deltaColor(costDir, true) }}>
                {costDir === "up" ? "▲ " : "▼ "}
                ${Math.abs(cost).toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>

      {(data.case_sets_differ || data.edited_cases > 0) && (
        <div style={s.flags}>
          {data.case_sets_differ && (
            <span style={s.flag}>
              {t("compare.caseSetsDiffer", { old: data.case_sets_differ.old_count, new: data.case_sets_differ.new_count })}
            </span>
          )}
          {data.edited_cases > 0 && <span style={s.flag}>{t("compare.editedCases", { count: data.edited_cases })}</span>}
        </div>
      )}

      <div>
        <div style={s.sectionLabel}>
          <Icon.FileText size={14} />
          {t("compare.promptDiff")}
        </div>
        <div style={s.legend}>
          <span style={s.legendItem}>
            <span style={s.swatch("var(--crit-bg, rgba(239,68,68,0.3))")} />
            {t("compare.legendOld", { version: oldV })}
          </span>
          <span style={s.legendItem}>
            <span style={s.swatch("var(--ok-bg, rgba(16,185,129,0.3))")} />
            {t("compare.legendNew", { version: newV })}
          </span>
        </div>
        {data.old.config && data.new.config ? (
          <div className="mono" style={s.diffBlock}>
            {diff.map((l, i) =>
              l.kind === "skip" ? (
                <div key={i} style={s.diffSkip}>
                  {t("compare.unchangedLines", { count: l.count })}
                </div>
              ) : (
              <div key={i} style={s.diffLine(l.kind)}>
                <span style={s.diffMark}>{l.kind === "add" ? t("compare.addedMark") : l.kind === "del" ? t("compare.removedMark") : ""}</span>
                <span style={{ minWidth: 0 }}>{l.text || " "}</span>
              </div>
              ),
            )}
          </div>
        ) : (
          <div style={s.muted}>{t("compare.snapshotMissing", { version: data.old.config ? newV : oldV })}</div>
        )}
      </div>

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
