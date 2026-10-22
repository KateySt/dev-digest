"use client";

import type React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import { Badge } from "@/components/ui/badge";
import type { LinkedSkill } from "../../helpers";

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
    <section className="flex flex-col gap-2.5" aria-label={skill.name}>
      <div className="flex items-center gap-2.5">
        <Link
          href={`/skills?skill=${encodeURIComponent(skill.id)}`}
          className="text-base font-semibold text-foreground underline"
          aria-label={t("used.openSkill", { name: skill.name })}
        >
          {skill.name}
        </Link>
        <Badge variant={skill.repo_id ? "brand" : "neutral"}>
          {skill.repo_id ? t("used.scopeProject") : t("used.scopeGlobal")}
        </Badge>
        <span className="text-xs text-subtle-foreground">{t("used.conventionCount", { count: items.length })}</span>
      </div>
      <div className="flex flex-col gap-3.5">{items.map(renderItem)}</div>
    </section>
  );
}
