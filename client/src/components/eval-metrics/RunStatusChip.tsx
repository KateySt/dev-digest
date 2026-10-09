"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { EvalSuiteRunStatus } from "@devdigest/shared";

const TONE: Record<EvalSuiteRunStatus, { color: string; bg: string }> = {
  running: { color: "var(--accent-text)", bg: "var(--accent-bg)" },
  completed: { color: "var(--ok)", bg: "var(--bg-hover)" },
  failed: { color: "var(--crit)", bg: "var(--bg-hover)" },
};

/** Run status chip (running / completed / failed). Text + colour, never colour alone. */
export function RunStatusChip({ status }: { status: EvalSuiteRunStatus }) {
  const t = useTranslations("evalMetrics");
  return (
    <Badge color={TONE[status].color} bg={TONE[status].bg} dot>
      {t(`status.${status}`)}
    </Badge>
  );
}
