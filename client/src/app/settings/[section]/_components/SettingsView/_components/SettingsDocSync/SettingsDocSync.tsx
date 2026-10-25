/* Settings → Docs sync (server/specs/doc-sync.md): when the nightly docs check
   runs, which repos it covers, and the latest runs. */
"use client";

import { useTranslations } from "next-intl";
import {
  useDocSyncRepos,
  useDocSyncRuns,
  useDocSyncSchedule,
  useSetDocSyncRepo,
  useStartDocSyncRun,
  useUpdateDocSyncSchedule,
} from "@/lib/hooks/doc-sync";
import { SectionTitle } from "../SectionTitle";
import { ScheduleForm } from "./_components/ScheduleForm";
import { DocSyncRepos } from "./_components/DocSyncRepos";
import { DocSyncRuns } from "./_components/DocSyncRuns";

export function SettingsDocSync() {
  const t = useTranslations("settings.docSync");
  const { data: schedule } = useDocSyncSchedule();
  const { data: repos } = useDocSyncRepos();
  const { data: runs } = useDocSyncRuns();
  const { mutate: saveSchedule, isPending: saving } = useUpdateDocSyncSchedule();
  const { mutate: setRepo } = useSetDocSyncRepo();
  const { mutate: startRun, isPending: starting } = useStartDocSyncRun();
  const canRun = (repos ?? []).some((r) => r.enabled && r.cloned);
  return (
    <div className="max-w-[720px]">
      <SectionTitle title={t("title")} body={t("body")} />
      {schedule && (
        <ScheduleForm
          schedule={schedule}
          saving={saving}
          onSave={(update, done) => saveSchedule(update, { onSuccess: done })}
        />
      )}
      {repos && (
        <DocSyncRepos
          repos={repos}
          onToggle={(id, enabled) => setRepo({ id, enabled })}
          onClearDismissed={(id) => setRepo({ id, clear_dismissed: true })}
        />
      )}
      {runs && <DocSyncRuns runs={runs} canRun={canRun} starting={starting} onRunNow={() => startRun()} />}
    </div>
  );
}
