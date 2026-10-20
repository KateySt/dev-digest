/* One memory in the Memory page list (design: kind + scope badges, confidence
   dot, content, source PR chips, "used …"). */
"use client";

import { useTranslations } from "next-intl";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import type { Memory } from "@devdigest/shared";
import { CONFIDENCE_TONE_CLASS, MEMORY_CLASSES as M } from "../../constants";
import { confidenceTone, usedLabel } from "../../helpers";

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
      className={cn(
        "flex w-full cursor-pointer flex-col gap-2.5 rounded-xl border bg-surface px-4 py-3.5 text-left [font:inherit] text-inherit",
        selected ? "border-primary" : "border-border",
      )}
      onClick={() => onSelect(m.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(m.id);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <span className={M.badge}>{t(`kind.${m.kind}`)}</span>
        <span className={M.badge}>{t(`scope.${m.scope}`)}</span>
        {m.unlinked && <span className={M.warnBadge}>{t("card.unlinked")}</span>}
        {m.stale && <span className={M.badge}>{t("card.stale")}</span>}
        {m.archived_at && <span className={M.badge}>{t("card.archived")}</span>}
        <span className={cn("ml-auto inline-flex items-center gap-1.5 text-xs", CONFIDENCE_TONE_CLASS[tone].text)} title={t("detail.stat.confidence")}>
          <span className={cn("size-1.75 rounded-full", CONFIDENCE_TONE_CLASS[tone].dot)} />
          {t("card.confidence", { pct: Math.round(m.confidence * 100) })}
        </span>
      </div>
      <div className={M.content}>
        <Markdown>{m.content}</Markdown>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {prs.map((pr) => (
          <span key={pr} className={M.prChip}>
            #{pr}
          </span>
        ))}
        <span className="ml-auto text-xs text-subtle-foreground">{used.key === "usedDaysAgo" ? t("card.usedDaysAgo", { days: used.days }) : t(`card.${used.key}`)}</span>
      </div>
    </div>
  );
}
