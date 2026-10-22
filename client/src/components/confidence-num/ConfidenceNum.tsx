"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Model confidence as "NN% conf" with a dot coloured by band (≥85 ok, ≥65 warn). */
export function ConfidenceNum({ value }: { value: number }) {
  const t = useTranslations("common.confidence");
  const pct = Math.round(value * 100);
  const dot = pct >= 85 ? "bg-ok" : pct >= 65 ? "bg-warn" : "bg-subtle-foreground";
  return (
    <span
      className="mono tnum inline-flex items-center gap-1.25 text-xs text-subtle-foreground"
      title={t("title")}
    >
      <span data-testid="confidence-dot" className={cn("size-1.5 rounded-full", dot)} />
      {t("value", { pct })}
    </span>
  );
}
