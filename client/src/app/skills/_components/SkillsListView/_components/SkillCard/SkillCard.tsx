"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import type { SkillListItem } from "@/lib/hooks/skills";
import { SKILL_TYPE_COLOR } from "../../constants";
import { hasBlockingFindings } from "../../scan";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill & Partial<Pick<SkillListItem, "usage">>;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const needsVetting = skill.source !== "manual" && !skill.enabled;
  const flagged = skill.scan_status === "flagged" && hasBlockingFindings(skill.scan_findings);
  const scanning = skill.scan_status === "pending";
  const usage = skill.usage;
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
      </div>
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
