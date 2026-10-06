"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton, Tabs } from "@devdigest/ui";
import { useScanSkill, useSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { SCAN_SEVERITY_COLOR } from "@/app/skills/_components/SkillsListView/constants";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { ContextTab } from "./_components/ContextTab";
import { EvalsTab } from "./_components/EvalsTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

/** Skill Editor — Config/Preview/Evals/Stats/Versions tabs for one skill.
 *  Mirrors the Agent Editor's shape (`AgentEditor.tsx`): owns the tab switch,
 *  the caller owns `?tab=` in the URL. Also owns the skill fetch + loading/
 *  error/not-found states, since (unlike agents) skills have no dedicated
 *  `/skills/:id` route — this renders inline in the Skills Lab split view. */
export function SkillEditor({
  skillId,
  tab,
  onTab,
  onClosed,
}: {
  skillId: string;
  tab: string;
  onTab: (t: string) => void;
  onClosed: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(skillId);
  const rescan = useScanSkill();

  if (isLoading || !skill) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={160} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <ErrorState
        title={notFound ? t("detail.notFound.title") : undefined}
        body={notFound ? t("detail.notFound.body") : t("detail.loadError")}
        onRetry={notFound ? undefined : () => refetch()}
      />
    );
  }

  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{skill.name}</h2>
        <Badge color="var(--text-secondary)" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
        <Button kind="secondary" size="sm" icon="FlaskConical" onClick={() => onTab("evals")}>
          {t("editor.runOnEvals")}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          icon="RefreshCw"
          disabled={rescan.isPending}
          onClick={() =>
            rescan.mutate(skill.id, { onError: () => toast.error(t("preview.rescanError")) })
          }
        >
          {t("editor.rescan")}
        </Button>
      </div>

      {skill.scan_status === "flagged" ? (
        <div style={s.scanAlert}>
          <div style={s.scanAlertHeader}>
            <Badge color="var(--crit)" icon="AlertOctagon">
              {t("preview.scanFlaggedNotice", { count: skill.scan_findings?.length ?? 0 })}
            </Badge>
          </div>
          <ul style={s.findingsList}>
            {(skill.scan_findings ?? []).map((f, i) => (
              <li key={i} style={s.findingItem}>
                <div style={s.findingHeader}>
                  <Badge color={SCAN_SEVERITY_COLOR[f.severity]}>{t(`preview.severity.${f.severity}`)}</Badge>
                  <span style={s.findingCategory}>{t(`preview.category.${f.category}`)}</span>
                </div>
                <blockquote style={s.findingExcerpt}>{f.excerpt}</blockquote>
                <div style={s.findingExplanation}>{f.explanation}</div>
                <div style={s.findingLocation}>{f.location}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : skill.scan_status === "error" ? (
        <div style={s.untrustedNotice}>{t("preview.scanErrorNotice")}</div>
      ) : skill.scan_status === "pending" ? (
        <div style={s.untrustedNotice}>{t("preview.scanPendingNotice")}</div>
      ) : (
        skill.source !== "manual" && <div style={s.untrustedNotice}>{t("preview.untrustedNotice")}</div>
      )}

      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "preview" ? (
          <PreviewTab skill={skill} />
        ) : tab === "context" ? (
          <ContextTab skill={skill} />
        ) : tab === "evals" ? (
          <EvalsTab skill={skill} />
        ) : tab === "stats" ? (
          <StatsTab skill={skill} />
        ) : tab === "versions" ? (
          <VersionsTab skill={skill} />
        ) : (
          <ConfigTab skill={skill} onDeleted={onClosed} />
        )}
      </div>
    </div>
  );
}
