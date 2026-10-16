"use client";

import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { Markdown } from "@/components/markdown";

/** Preview tab — the skill's body rendered as an agent would receive it. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div className="flex max-w-[900px] flex-col gap-1">
      <div className="text-base font-bold">{t("previewTab.title")}</div>
      <div className="mb-3 text-sm text-muted-foreground">{t("previewTab.subtitle")}</div>
      <div className="rounded-lg border border-border bg-surface px-4.5 py-4">
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
