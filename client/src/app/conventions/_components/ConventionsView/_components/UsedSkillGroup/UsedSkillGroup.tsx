"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import type { LinkedSkill } from "../../helpers";
import { s } from "./styles";

/** "Used in skills" group: the skill a set of conventions was merged into —
 *  name links to the skill, badge shows its current scope — with the
 *  conventions rendered by the caller (SPEC-2026-10-16-convention-skills AC-19). */
export function UsedSkillGroup({
  skill,
  items,
  renderItem,
}: {
  skill: LinkedSkill;
  items: ConventionCandidate[];
  renderItem: (c: ConventionCandidate) => React.ReactNode;
}) {
  const t = useTranslations("conventions");
  return (
    <section style={s.group} aria-label={skill.name}>
      <div style={s.header}>
        <Link href={`/skills?skill=${encodeURIComponent(skill.id)}`} style={s.name} aria-label={t("used.openSkill", { name: skill.name })}>
          {skill.name}
        </Link>
        <Badge color={skill.repo_id ? "var(--accent)" : "var(--text-secondary)"}>
          {skill.repo_id ? t("used.scopeProject") : t("used.scopeGlobal")}
        </Badge>
        <span style={s.count}>{t("used.conventionCount", { count: items.length })}</span>
      </div>
      <div style={s.list}>{items.map(renderItem)}</div>
    </section>
  );
}
