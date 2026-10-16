"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/contexts";
import { useRepos } from "@/lib/hooks";
import { useDesktop, type DesktopPrLink } from "@/lib/desktop";

/**
 * Desktop app only: a `devdigest://pr?url=https://github.com/o/r/pull/N` link
 * opens that PR's page when its repo is added here, otherwise explains why
 * not. Navigation only — a link never starts a review. (`devdigest://open`
 * links reuse the notification route channel, handled by useDesktopNotifier.)
 */
export function useDesktopDeepLinks(): void {
  const desktop = useDesktop();
  const router = useRouter();
  const t = useTranslations("shell.deepLink");
  const { data: repos, isError } = useRepos();
  const [pending, setPending] = React.useState<DesktopPrLink | null>(null);

  React.useEffect(() => desktop?.app.onOpenPr(setPending), [desktop]);

  // Resolve once the repo list is in (a cold start delivers the link before it loads).
  React.useEffect(() => {
    if (!pending || (!repos && !isError)) return;
    const full = `${pending.owner}/${pending.repo}`.toLowerCase();
    const repo = repos?.find((r) => r.full_name.toLowerCase() === full);
    if (repo) router.push(`/repos/${repo.id}/pulls/${pending.number}`);
    else notify.info(t("repoNotAdded", { repo: `${pending.owner}/${pending.repo}` }));
    setPending(null);
  }, [pending, repos, isError, router, t]);
}
