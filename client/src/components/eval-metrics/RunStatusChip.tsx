"use client";

import { useTranslations } from "next-intl";
import type { EvalSuiteRunStatus } from "@devdigest/shared";
import { Badge } from "@/components/ui/badge";

const TONE: Record<EvalSuiteRunStatus, { variant: "brand" | "neutral"; text?: string }> = {
  running: { variant: "brand" },
  completed: { variant: "neutral", text: "text-ok" },
  failed: { variant: "neutral", text: "text-crit" },
};

/** Run status chip (running / completed / failed). Text + colour, never colour alone. */
export function RunStatusChip({ status }: { status: EvalSuiteRunStatus }) {
  const t = useTranslations("evalMetrics");
  const tone = TONE[status];
  return (
    <Badge variant={tone.variant} data-status={status} className={tone.text}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {t(`status.${status}`)}
    </Badge>
  );
}
