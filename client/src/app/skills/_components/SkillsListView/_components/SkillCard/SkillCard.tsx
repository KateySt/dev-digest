"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { Icon } from "@/components/icon";
import { TagChip } from "@/components/tag-chip";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { SkillListItem } from "@/lib/hooks/skills";
import { useTheme } from "@/lib/contexts";
import { tagColor } from "@/lib/tag-colors";
import { hasBlockingFindings } from "@/lib/skill-scan";
import { cn } from "@/lib/utils";
import { SKILL_TYPE_BADGE } from "@/lib/skill-constants";
import { MAX_VISIBLE_TAGS } from "../../constants";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
  /** Scoped project's display name (SPEC-07 AC-50) — resolved by the parent
   *  from `skill.repo_id` against the repos list. Null/undefined for a
   *  global skill, which renders no scope badge (AC-51). */
  repoName,
}: {
  skill: Skill & Partial<Pick<SkillListItem, "usage">>;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  repoName?: string | null;
}) {
  const t = useTranslations("skills");
  const { theme } = useTheme();
  const needsVetting = skill.source !== "manual" && !skill.enabled;
  const flagged = skill.scan_status === "flagged" && hasBlockingFindings(skill.scan_findings);
  const scanning = skill.scan_status === "pending";
  const usage = skill.usage;
  const tags = skill.tags ?? [];
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
  const overflowCount = tags.length - visibleTags.length;
  return (
    <div
      onClick={onClick}
      data-active={active ? "true" : undefined}
      data-flagged={flagged ? "true" : undefined}
      className={cn(
        "flex cursor-pointer flex-col gap-2.5 rounded-xl border bg-surface p-4",
        flagged ? "border-crit" : active ? "border-primary" : "border-border",
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="grid size-6.5 shrink-0 place-items-center rounded-[7px] bg-muted text-primary">
          <Icon.Sparkles size={15} aria-hidden />
        </div>
        <span className="min-w-0 flex-1 text-base font-semibold">{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              size="sm"
              checked={skill.enabled}
              onCheckedChange={onToggle}
              aria-label={t("preview.enabled")}
            />
          </div>
        )}
      </div>
      <div className="line-clamp-2 text-sm text-muted-foreground">{skill.description}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={SKILL_TYPE_BADGE[skill.type]}>{t(`listItem.type.${skill.type}`)}</Badge>
        {flagged && (
          <span title={t("listItem.scanFlaggedTitle")}>
            <Badge variant="crit">
              <Icon.AlertOctagon aria-hidden />
              {t("listItem.scanFlagged", { count: skill.scan_findings?.length ?? 0 })}
            </Badge>
          </span>
        )}
        {scanning && (
          <Badge variant="neutral">
            <Icon.Clock aria-hidden />
            {t("listItem.scanning")}
          </Badge>
        )}
        {needsVetting && (
          <span title={t("listItem.vettingTitle")}>
            <Badge variant="warn">
              <Icon.AlertTriangle aria-hidden />
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
        {repoName && (
          <Badge variant="neutral">
            <Icon.GitBranch aria-hidden />
            {repoName}
          </Badge>
        )}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleTags.map((tag) => (
            <TagChip key={tag} slug={tag} color={tagColor(tag, theme)} />
          ))}
          {overflowCount > 0 && <span className="text-[11.5px] text-subtle-foreground">+{overflowCount}</span>}
        </div>
      )}
      {usage && usage.used_by_agents > 0 && (
        <div className="text-xs text-subtle-foreground">
          {t("listItem.usage", {
            agents: usage.used_by_agents,
            pull: usage.pull_frequency != null ? Math.round(usage.pull_frequency * 100) : 0,
            accept: usage.accept_rate != null ? Math.round(usage.accept_rate * 100) : 0,
          })}
        </div>
      )}
    </div>
  );
}
