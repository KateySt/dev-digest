"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton, Tabs } from "@devdigest/ui";
import { useSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
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
  const { data: skill, isLoading, isError, error, refetch } = useSkill(skillId);

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
      </div>

      {skill.source !== "manual" && <div style={s.untrustedNotice}>{t("preview.untrustedNotice")}</div>}

      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "preview" ? (
          <PreviewTab skill={skill} />
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
