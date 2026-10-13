/* One memory in the Memory page list (design: kind + scope badges, confidence
   dot, content, source PR chips, "used …"). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Memory } from "@devdigest/shared";
import { confidenceTone, usedLabel } from "../../helpers";
import { s } from "../../styles";

export function MemoryCard({
  m,
  selected,
  now,
  onSelect,
}: {
  m: Memory;
  selected: boolean;
  now: Date;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("memory");
  const tone = confidenceTone(m.confidence);
  const used = usedLabel(m.last_used_at, now);
  const prs = [...new Set(m.sources.map((src) => src.pr).filter((p): p is number => typeof p === "number"))];
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      style={s.card(selected)}
      onClick={() => onSelect(m.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(m.id);
        }
      }}
    >
      <div style={s.cardTop}>
        <span style={s.badge}>{t(`kind.${m.kind}`)}</span>
        <span style={s.badge}>{t(`scope.${m.scope}`)}</span>
        {m.unlinked && <span style={s.warnBadge}>{t("card.unlinked")}</span>}
        {m.stale && <span style={s.badge}>{t("card.stale")}</span>}
        {m.archived_at && <span style={s.badge}>{t("card.archived")}</span>}
        <span style={s.conf(tone)} title={t("detail.stat.confidence")}>
          <span style={s.dot(tone)} />
          {t("card.confidence", { pct: Math.round(m.confidence * 100) })}
        </span>
      </div>
      <div style={s.content}>
        <Markdown>{m.content}</Markdown>
      </div>
      <div style={s.cardBottom}>
        {prs.map((pr) => (
          <span key={pr} className="mono" style={s.prChip}>
            #{pr}
          </span>
        ))}
        <span style={s.used}>{used.key === "usedDaysAgo" ? t("card.usedDaysAgo", { days: used.days }) : t(`card.${used.key}`)}</span>
      </div>
    </div>
  );
}
