"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalRegressionAlert } from "@devdigest/shared";
import { s } from "../styles";

/** Warning banner built from the server alert's structured fields (i18n). When
 *  the two runs used a different provider/model (`model_changed`) the banner
 *  says so — the drop may come from the model, not the config. */
export function RegressionBanner({ alert }: { alert: EvalRegressionAlert }) {
  const t = useTranslations("evalMetrics");
  const lead = alert.drops
    .map((d) => t("banner.dipped", { metric: t(`metrics.${d.metric}`), points: Math.round(d.points * 10) / 10 }))
    .join(", ");
  const others = alert.others.map((o) => t(`banner.${o.direction}`, { metric: t(`metrics.${o.metric}`) })).join(", ");
  return (
    <div role="status" style={s.banner}>
      <Icon.AlertTriangle size={18} style={{ color: "var(--warn)", flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span style={s.bannerLead}>{lead}</span>{" "}
        {t("banner.context", { version: alert.version, previous: alert.previous_version })}
        {others && ` ${others}.`}
        {alert.model_changed && ` ${t("banner.modelChanged")}`}
      </span>
    </div>
  );
}
