"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, TagChip, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import type { SkillListItem } from "@/lib/hooks/skills";
import { useTheme } from "@/lib/theme";
import { tagColor } from "@/lib/tag-colors";
import { SKILL_TYPE_COLOR, MAX_VISIBLE_TAGS } from "../../constants";
import { hasBlockingFindings } from "../../scan";
import { s } from "./styles";

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
    <div onClick={onClick} style={s.card(!!active, flagged)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <Badge color={SKILL_TYPE_COLOR[skill.type]}>{t(`listItem.type.${skill.type}`)}</Badge>
        {flagged && (
          <span title={t("listItem.scanFlaggedTitle")}>
            <Badge color="var(--crit)" icon="AlertOctagon">
              {t("listItem.scanFlagged", { count: skill.scan_findings?.length ?? 0 })}
            </Badge>
          </span>
        )}
        {scanning && (
          <Badge color="var(--text-secondary)" icon="Clock">
            {t("listItem.scanning")}
          </Badge>
        )}
        {needsVetting && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
        {repoName && (
          <Badge color="var(--text-secondary)" icon="GitBranch">
            {repoName}
          </Badge>
        )}
      </div>
      {tags.length > 0 && (
        <div style={s.tagRow}>
          {visibleTags.map((tag) => (
            <TagChip key={tag} slug={tag} color={tagColor(tag, theme)} />
          ))}
          {overflowCount > 0 && <span style={s.tagOverflow}>+{overflowCount}</span>}
        </div>
      )}
      {usage && usage.used_by_agents > 0 && (
        <div style={s.usageRow}>
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
