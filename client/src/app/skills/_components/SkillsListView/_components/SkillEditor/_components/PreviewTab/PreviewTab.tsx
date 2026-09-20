"use client";

import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

/** Preview tab — the skill's body rendered as an agent would receive it. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <div style={s.sectionTitle}>{t("previewTab.title")}</div>
      <div style={s.subtitle}>{t("previewTab.subtitle")}</div>
      <div style={s.card}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
