/* AutoTriggerStatus — pill showing whether automatic reviews are ON/OFF, with a
   pulsing dot and an optional polling-interval detail. */
"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function AutoTriggerStatus({ on = true, detail }: { on?: boolean; detail?: string }) {
  const t = useTranslations("common.autoTrigger");
  return (
    <button
      type="button"
      title={t("title")}
      className="inline-flex items-center gap-2.5 rounded-[7px] border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground"
    >
      <span
        className={cn(
          "size-[7px] rounded-full",
          on ? "animate-dd-pulse-slow bg-ok shadow-[0_0_0_3px_var(--ok-bg)]" : "bg-subtle-foreground",
        )}
      />
      <span>
        {t("label")}{" "}
        <b className={cn("font-semibold", on ? "text-ok" : "text-subtle-foreground")}>{on ? t("on") : t("off")}</b>
      </span>
      {on && <span className="text-subtle-foreground">· {detail ?? t("defaultDetail")}</span>}
    </button>
  );
}
