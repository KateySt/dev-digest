"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";

/** First tasks (C-AC-17): the model-generated starter-area suggestions,
 *  rendered as markdown (never raw HTML — C-AC-29). */
export function FirstTasksSection({ firstTasksMd }: { firstTasksMd: string | null | undefined }) {
  const t = useTranslations("onboarding.sections.firstTasks");
  if (!firstTasksMd) return <div style={s.empty}>{t("empty")}</div>;
  return <Markdown>{firstTasksMd}</Markdown>;
}

const s = {
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "4px 0" } as React.CSSProperties,
};

export default FirstTasksSection;
