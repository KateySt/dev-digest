"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CiSyncError } from "@devdigest/shared";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { ciSyncErrorView, reexportHref } from "@/lib/ci-sync-errors";

/** C-AC-51/52: installations the last sync skipped, each with what is wrong,
 *  how to fix it and a Fix action. The other rows still refreshed. */
export function SyncErrors({
  errors,
  agentName,
  onConnection,
}: {
  errors: CiSyncError[];
  agentName: (agentId: string) => string;
  onConnection: (repo: string) => void;
}) {
  const t = useTranslations("ci");
  const router = useRouter();
  if (errors.length === 0) return null;

  return (
    <div role="alert" className="mb-4 flex min-w-0 flex-col gap-2 rounded-xl border border-crit bg-surface px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-crit">
        <Icon.AlertTriangle size={15} aria-hidden />
        {t("runs.syncErrors.title")}
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {errors.map((e) => {
          const view = ciSyncErrorView(e.code);
          const fix = () =>
            view.action === "reexport"
              ? router.push(reexportHref(e.agent_id, e.installation_id))
              : onConnection(e.repo);
          return (
            <li key={e.installation_id} className="flex min-w-0 flex-wrap items-center gap-2.5 text-sm">
              <span className="min-w-0 flex-1 wrap-anywhere">
                <span className="mono font-semibold text-foreground">
                  {t("runs.syncErrors.entry", { repo: e.repo, agent: agentName(e.agent_id) })}
                </span>{" "}
                <span className="text-crit">{t(`jenkins.syncErrors.${view.whatKey}`)}</span>{" "}
                <span className="text-muted-foreground">{t(`jenkins.syncErrors.${view.fixKey}`)}</span>
              </span>
              <Button variant="secondary" size="sm" onClick={fix}>
                {t(`jenkins.syncErrors.${view.actionKey}`)}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
