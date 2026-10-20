"use client";

import { useTranslations } from "next-intl";
import type { EvalRegressionAlert } from "@devdigest/shared";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { WRAP } from "../constants";

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
    <div
      role="status"
      className={cn(
        "mb-4.5 flex items-center gap-3 rounded-lg border border-warn bg-warn/8 px-4 py-3 text-base text-muted-foreground",
        WRAP,
      )}
    >
      <Icon.AlertTriangle size={18} className="shrink-0 text-warn" aria-hidden />
      <span className="min-w-0">
        <span className="font-bold text-foreground">{lead}</span>{" "}
        {t("banner.context", { version: alert.version, previous: alert.previous_version })}
        {others && ` ${others}.`}
        {alert.model_changed && ` ${t("banner.modelChanged")}`}
      </span>
    </div>
  );
}
