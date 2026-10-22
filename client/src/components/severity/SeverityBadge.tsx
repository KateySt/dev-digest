"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { SEVERITY_STYLE, type Severity } from "./tokens";

/** Severity badge — always icon + label (WCAG AA: never colour alone). */
export function SeverityBadge({
  severity,
  count,
  compact,
}: {
  severity: Severity;
  count?: number;
  compact?: boolean;
}) {
  const t = useTranslations("common.severity");
  const s = SEVERITY_STYLE[severity];
  const I = Icon[s.icon];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[5px] text-xs font-semibold tracking-[0.04em] uppercase",
        s.text,
        compact ? "p-0" : cn("px-2.25 py-0.75", s.bg),
      )}
    >
      {compact ? <I size={12.5} role="img" aria-label={t(severity)} /> : <I size={12.5} aria-hidden />}
      {compact ? null : t(severity)}
      {count != null && <span className="tnum opacity-85">{count}</span>}
    </span>
  );
}
