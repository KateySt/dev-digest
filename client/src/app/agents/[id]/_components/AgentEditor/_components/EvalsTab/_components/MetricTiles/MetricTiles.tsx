"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentEvalStats } from "@devdigest/shared";
import { MetricDelta, MetricValue } from "@/components/eval-metrics";
import { METRIC_COLOR } from "@/lib/eval";
import { s } from "../../styles";

/** Four tiles: Recall / Precision / Citation accuracy (metric colours, point
 *  delta vs. the previous finished run) and a neutral "Traces passed x/y".
 *  Null metric → "—" with no delta. */
export function MetricTiles({ stats }: { stats: AgentEvalStats | undefined }) {
  const t = useTranslations("eval");
  const tiles = [
    { key: "recall", label: t("evalsTab.tiles.recall"), value: stats?.recall, delta: stats?.delta.recall, color: METRIC_COLOR.recall },
    { key: "precision", label: t("evalsTab.tiles.precision"), value: stats?.precision, delta: stats?.delta.precision, color: METRIC_COLOR.precision },
    {
      key: "citation",
      label: t("evalsTab.tiles.citation"),
      value: stats?.citation_accuracy,
      delta: stats?.delta.citation_accuracy,
      color: METRIC_COLOR.citation_accuracy,
    },
  ] as const;
  const passed = stats?.traces_passed;
  const evaluated = stats?.traces_evaluated;

  return (
    <div style={s.tileRow}>
      {tiles.map((m) => (
        <div key={m.key} style={s.tile}>
          <div style={s.tileLabel}>{m.label}</div>
          <div style={s.tileValueRow}>
            <MetricValue value={m.value} color={m.color} />
            {m.value != null && <MetricDelta delta={m.delta} />}
          </div>
        </div>
      ))}
      <div style={s.tile}>
        <div style={s.tileLabel}>{t("evalsTab.tiles.traces")}</div>
        <div style={s.tileValueRow}>
          <span className="tnum" style={{ fontSize: 22, fontWeight: 700, color: passed == null ? "var(--text-muted)" : "var(--text-primary)" }}>
            {passed != null && evaluated != null ? `${passed}/${evaluated}` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
