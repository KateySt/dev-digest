/* ResultsHeader — "Configure run", title, "N selected agents · parallel",
   Columns/Tabs toggle (+ "Cancel all" while in flight) and the PR / totals line. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { MultiAgentRun } from "@devdigest/shared";
import type { ResultsView } from "../../constants";
import { formatCost, formatDuration } from "@/app/multi-agent/helpers";
import { s } from "./styles";

export interface ResultsHeaderProps {
  run: MultiAgentRun;
  view: ResultsView;
  inFlight: boolean;
  cancelAllPending?: boolean;
  onConfigure: () => void;
  onViewChange: (view: ResultsView) => void;
  onCancelAll: () => void;
}

export function ResultsHeader({
  run,
  view,
  inFlight,
  cancelAllPending,
  onConfigure,
  onViewChange,
  onCancelAll,
}: ResultsHeaderProps) {
  const t = useTranslations("runs.multiAgent.results");
  const partial = !!run.totals_partial;
  const metaKey = partial ? "metaPartial" : "meta";
  const meta = t(metaKey, {
    count: run.agent_count,
    duration: formatDuration(run.total_duration_ms),
    cost: run.total_cost_usd == null ? t("costUnknown") : formatCost(run.total_cost_usd),
  });

  return (
    <div style={s.root}>
      <div style={s.topRow}>
        <Button kind="secondary" size="sm" icon="Settings" onClick={onConfigure}>
          {t("configureRun")}
        </Button>
        <h1 style={s.title}>{t("title")}</h1>
        <span style={s.sub}>{t("selectedAgents", { count: run.columns.length })}</span>
        <span style={s.spacer} />
        {inFlight && (
          <Button kind="danger" size="sm" icon="X" disabled={cancelAllPending} onClick={onCancelAll}>
            {t("cancelAll")}
          </Button>
        )}
        <div role="group" aria-label={t("viewToggle")} style={s.toggle}>
          {(["columns", "tabs"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              style={s.toggleBtn(view === v)}
              onClick={() => onViewChange(v)}
            >
              {t(v === "columns" ? "viewColumns" : "viewTabs")}
            </button>
          ))}
        </div>
      </div>
      <div style={s.bottomRow}>
        <span style={s.pr}>
          <span className="mono" style={s.prNum}>
            {run.pr_number != null ? t("prLine", { number: run.pr_number }) : "—"}
          </span>
          <span style={s.prTitle}>{run.pr_title ?? "—"}</span>
        </span>
        <span style={s.meta} data-testid="results-meta">
          {meta}
        </span>
      </div>
    </div>
  );
}
