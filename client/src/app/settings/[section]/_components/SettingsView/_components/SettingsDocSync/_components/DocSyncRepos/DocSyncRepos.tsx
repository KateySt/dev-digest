/* Which repositories the docs check covers — opt-in per repo. */
"use client";

import { useLocale, useTranslations } from "next-intl";
import type { DocSyncRepo } from "@devdigest/shared";
import { Button } from "@/components/ui/button";
import { PrefRow } from "../../../PrefRow";
import { formatWhen } from "../../helpers";

export function DocSyncRepos({
  repos,
  onToggle,
  onClearDismissed,
}: {
  repos: DocSyncRepo[];
  onToggle: (id: string, enabled: boolean) => void;
  onClearDismissed: (id: string) => void;
}) {
  const t = useTranslations("settings.docSync");
  const locale = useLocale();

  return (
    <section className="mb-8">
      <h3 className="mb-2 text-lg font-semibold">{t("reposTitle")}</h3>
      {repos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("reposEmpty")}</p>
      ) : (
        repos.map((repo) => (
          <div key={repo.id}>
            <PrefRow
              label={repo.full_name}
              hint={
                !repo.cloned
                  ? t("repoNotCloned")
                  : repo.last_checked_at
                    ? t("repoLastChecked", { when: formatWhen(repo.last_checked_at, locale) })
                    : t("repoNeverChecked")
              }
              on={repo.enabled}
              disabled={!repo.cloned}
              onChange={(enabled) => onToggle(repo.id, enabled)}
            />
            {repo.dismissed > 0 && (
              <p className="flex items-center gap-2 py-1.5 text-xs text-subtle-foreground">
                {t("dismissed", { count: repo.dismissed })}
                <Button variant="link" size="xs" className="h-auto p-0" onClick={() => onClearDismissed(repo.id)}>
                  {t("clearDismissed")}
                </Button>
              </p>
            )}
          </div>
        ))
      )}
    </section>
  );
}
