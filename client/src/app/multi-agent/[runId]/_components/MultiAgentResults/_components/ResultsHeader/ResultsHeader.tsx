/* ResultsHeader — "Configure run", title, "N selected agents · parallel",
   Columns/Tabs toggle (+ "Cancel all" while in flight) and the PR / totals line. */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MultiAgentRun } from "@devdigest/shared";
import type { ResultsView } from "../../constants";
import { formatCost, formatDuration } from "@/app/multi-agent/helpers";

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
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3.5">
        <Button variant="secondary" size="sm" onClick={onConfigure}>
          <Icon.Settings aria-hidden />
          {t("configureRun")}
        </Button>
        <h1 className="m-0 text-3xl font-bold text-foreground">{t("title")}</h1>
        <span className="text-sm text-subtle-foreground">{t("selectedAgents", { count: run.columns.length })}</span>
        <span className="flex-1" />
        {inFlight && (
          <Button variant="destructive" size="sm" disabled={cancelAllPending} onClick={onCancelAll}>
            <Icon.X aria-hidden />
            {t("cancelAll")}
          </Button>
        )}
        <div role="group" aria-label={t("viewToggle")} className="inline-flex gap-0.5 rounded-lg border border-border bg-elevated p-0.5">
          {(["columns", "tabs"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              className={cn(
                "cursor-pointer rounded-md border-none px-3 py-1.25 text-ui",
                view === v
                  ? "bg-accent font-semibold text-foreground"
                  : "bg-transparent font-medium text-subtle-foreground",
              )}
              onClick={() => onViewChange(v)}
            >
              {t(v === "columns" ? "viewColumns" : "viewTabs")}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="mono text-ui text-subtle-foreground">
            {run.pr_number != null ? t("prLine", { number: run.pr_number }) : "—"}
          </span>
          <span className="min-w-0 text-[13.5px] font-semibold wrap-anywhere text-foreground">{run.pr_title ?? "—"}</span>
        </span>
        <span className="text-ui text-muted-foreground" data-testid="results-meta">
          {meta}
        </span>
      </div>
    </div>
  );
}
