"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useScanSkill, useSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/contexts/toast";
import { ApiError } from "@/lib/api";
import { useSkillEvalActivity } from "@/lib/hooks/eval-runs";
import { SCAN_SEVERITY_COLOR, SKILL_TYPE_COLOR } from "@/lib/skill-constants";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { ContextTab } from "./_components/ContextTab";
import { EvalsTab } from "./_components/EvalsTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { runBlockText } from "@/lib/skill-scan";
import { s } from "./styles";

const RUN_REASON_ID = "skill-run-on-evals-reason";

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

  if (isLoading || !skill) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={160} />
        <Skeleton height={200} />
      </div>
    );
  }

  // Keyed by skill so per-skill state (unsaved draft, run controller) resets on switch.
  return <SkillEditorBody key={skill.id} skill={skill} tab={tab} onTab={onTab} onClosed={onClosed} />;
}

function SkillEditorBody({
  skill,
  tab,
  onTab,
  onClosed,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
  onClosed: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const rescan = useScanSkill();
  const activity = useSkillEvalActivity(skill.id, skill);

  // Unsaved Config text, lifted here so it survives tab switches and feeds
  // "Run on evals". Tied to the version it was typed against: a save, restore
  // or Promote bumps `skill.version`, which discards it (back to `skill.body`).
  const [draftState, setDraftState] = React.useState<{ version: number; body: string } | null>(null);
  const body = draftState && draftState.version === skill.version ? draftState.body : skill.body;
  const setBody = (next: string) => setDraftState({ version: skill.version, body: next });

  const blockText = runBlockText(t, activity.disabledReason);

  // Unsaved text differs from the saved text → draft run; otherwise a normal run.
  const runOnEvals = () => {
    activity.start(body !== skill.body ? body : undefined);
    onTab("evals");
  };

  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.iconTile} aria-hidden="true">
          <Icon.Sparkles size={17} />
        </span>
        <h2 className="mono" style={s.h2}>
          {skill.name}
        </h2>
        <Badge color={SKILL_TYPE_COLOR[skill.type]}>{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-secondary)" mono icon="GitCommit">
          {t("preview.version", { version: skill.version })}
        </Badge>
        <div style={s.headerActions}>
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
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            onClick={runOnEvals}
            disabled={!!activity.disabledReason}
            title={blockText}
            aria-describedby={blockText ? RUN_REASON_ID : undefined}
          >
            {t("editor.runOnEvals")}
          </Button>
          {blockText && (
            <span id={RUN_REASON_ID} style={s.srOnly}>
              {blockText}
            </span>
          )}
        </div>
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
          <EvalsTab skill={skill} activity={activity} runBlockText={blockText} />
        ) : tab === "stats" ? (
          <StatsTab skill={skill} />
        ) : tab === "versions" ? (
          <VersionsTab skill={skill} />
        ) : (
          <ConfigTab
            skill={skill}
            body={body}
            onBodyChange={setBody}
            onSaved={() => setDraftState(null)}
            onDeleted={onClosed}
          />
        )}
      </div>
    </div>
  );
}
