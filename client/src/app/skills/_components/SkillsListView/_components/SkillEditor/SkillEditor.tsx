"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageTabs } from "@/components/page-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useScanSkill, useSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/contexts";
import { ApiError } from "@/lib/api";
import { useSkillEvalActivity } from "@/lib/hooks/eval-runs";
import { runBlockText } from "@/lib/skill-scan";
import { SCAN_SEVERITY_BADGE, SKILL_TYPE_BADGE } from "@/lib/skill-constants";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { ContextTab } from "./_components/ContextTab";
import { EvalsTab } from "./_components/EvalsTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";

const RUN_REASON_ID = "skill-run-on-evals-reason";

const NOTICE = "mb-3.5 rounded-lg border border-warn bg-warn-bg px-3 py-2.5 text-ui leading-normal text-warn";

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
      <div className="flex flex-col">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-[200px] w-full" />
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
    <div className="flex flex-col">
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <span
          className="grid size-7.5 shrink-0 place-items-center rounded-lg bg-muted text-primary"
          aria-hidden="true"
        >
          <Icon.Sparkles size={17} />
        </span>
        {/* Long skill names wrap instead of pushing the actions off-screen (client/INSIGHTS.md 2026-09-24). */}
        <h2 className="mono min-w-0 text-2xl font-bold wrap-anywhere break-words">{skill.name}</h2>
        <Badge variant={SKILL_TYPE_BADGE[skill.type]}>{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge variant="neutral" className="mono">
          <Icon.GitCommit aria-hidden />
          {t("preview.version", { version: skill.version })}
        </Badge>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={rescan.isPending}
            onClick={() =>
              rescan.mutate(skill.id, { onError: () => toast.error(t("preview.rescanError")) })
            }
          >
            <Icon.RefreshCw aria-hidden />
            {t("editor.rescan")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={runOnEvals}
            disabled={!!activity.disabledReason}
            title={blockText}
            aria-describedby={blockText ? RUN_REASON_ID : undefined}
          >
            <Icon.Play aria-hidden />
            {t("editor.runOnEvals")}
          </Button>
          {blockText && (
            <span id={RUN_REASON_ID} className="sr-only">
              {blockText}
            </span>
          )}
        </div>
      </div>

      {skill.scan_status === "flagged" ? (
        <div className="mb-3.5 flex flex-col gap-2.5 rounded-lg border border-crit bg-crit-bg px-3 py-2.5">
          <div className="flex items-center">
            <Badge variant="crit">
              <Icon.AlertOctagon aria-hidden />
              {t("preview.scanFlaggedNotice", { count: skill.scan_findings?.length ?? 0 })}
            </Badge>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {(skill.scan_findings ?? []).map((f, i) => (
              <li key={i} className="flex flex-col gap-1.5 border-t border-border pt-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant={SCAN_SEVERITY_BADGE[f.severity]}>{t(`preview.severity.${f.severity}`)}</Badge>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t(`preview.category.${f.category}`)}
                  </span>
                </div>
                <blockquote className="mono m-0 border-l-2 border-border px-2.5 py-1.5 text-ui whitespace-pre-wrap text-muted-foreground">
                  {f.excerpt}
                </blockquote>
                <div className="text-sm leading-normal">{f.explanation}</div>
                <div className="text-xs text-subtle-foreground">{f.location}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : skill.scan_status === "error" ? (
        <div className={NOTICE}>{t("preview.scanErrorNotice")}</div>
      ) : skill.scan_status === "pending" ? (
        <div className={NOTICE}>{t("preview.scanPendingNotice")}</div>
      ) : (
        skill.source !== "manual" && <div className={NOTICE}>{t("preview.untrustedNotice")}</div>
      )}

      <PageTabs tabs={tabs} value={tab} onChange={onTab} className="-mx-6 px-6" />
      <div className="pt-4.5">
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
