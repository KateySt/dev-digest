"use client";

import { useTranslations } from "next-intl";
import type { AgentEvalStats } from "@devdigest/shared";
import { MetricDelta, MetricValue } from "@/components/eval-metrics";
import { cn } from "@/lib/utils";

const TILE = "min-w-0 rounded-[9px] border border-border bg-elevated px-4 py-3.5";
const TILE_LABEL = "mb-2 text-2xs font-bold tracking-[0.05em] text-subtle-foreground uppercase";
const TILE_ROW = "flex flex-wrap items-baseline gap-2";

/** Four tiles: Recall / Precision / Citation accuracy (metric colours, point
 *  delta vs. the previous finished run) and a neutral "Traces passed x/y".
 *  Null metric → "—" with no delta. */
export function MetricTiles({ stats }: { stats: AgentEvalStats | undefined }) {
  const t = useTranslations("eval");
  const tiles = [
    { key: "recall", label: t("evalsTab.tiles.recall"), value: stats?.recall, delta: stats?.delta.recall },
    { key: "precision", label: t("evalsTab.tiles.precision"), value: stats?.precision, delta: stats?.delta.precision },
    {
      key: "citation_accuracy",
      label: t("evalsTab.tiles.citation"),
      value: stats?.citation_accuracy,
      delta: stats?.delta.citation_accuracy,
    },
  ] as const;
  const passed = stats?.traces_passed;
  const evaluated = stats?.traces_evaluated;

  return (
    <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-3.5">
      {tiles.map((m) => (
        <div key={m.key} className={TILE}>
          <div className={TILE_LABEL}>{m.label}</div>
          <div className={TILE_ROW}>
            <MetricValue value={m.value} metric={m.key} />
            {m.value != null && <MetricDelta delta={m.delta} />}
          </div>
        </div>
      ))}
      <div className={TILE}>
        <div className={TILE_LABEL}>{t("evalsTab.tiles.traces")}</div>
        <div className={TILE_ROW}>
          <span className={cn("tnum text-3xl font-bold", passed == null ? "text-subtle-foreground" : "text-foreground")}>
            {passed != null && evaluated != null ? `${passed}/${evaluated}` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
