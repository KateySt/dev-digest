"use client";

import { useTranslations } from "next-intl";
import { Markdown } from "@/components/markdown";

/** First tasks (C-AC-17): the model-generated starter-area suggestions,
 *  rendered as markdown (never raw HTML — C-AC-29). */
export function FirstTasksSection({ firstTasksMd }: { firstTasksMd: string | null | undefined }) {
  const t = useTranslations("onboarding.sections.firstTasks");
  if (!firstTasksMd) return <div className="py-1 text-sm text-subtle-foreground">{t("empty")}</div>;
  return <Markdown>{firstTasksMd}</Markdown>;
}

export default FirstTasksSection;
