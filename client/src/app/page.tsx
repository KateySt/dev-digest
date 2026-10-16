/* Root — sends the user to the first-run wizard while keys are missing (the
   AppShell guard does the redirect), else to the first repo's PR list, or
   onboarding if no repos. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PageContainer } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRepos, useSetupState } from "@/lib/hooks";

export default function HomePage() {
  const t = useTranslations("common.home");
  const router = useRouter();
  const { data: repos, isLoading: reposLoading, isError } = useRepos();
  const setup = useSetupState();
  // Hold the skeleton until the setup check settles — otherwise the empty
  // state flashes before the guard redirects to /first-run.
  const isLoading = reposLoading || setup.isLoading || setup.state?.needsSetup === true;

  React.useEffect(() => {
    if (!isLoading && repos && repos.length > 0) {
      router.replace(`/repos/${repos[0]!.id}/pulls`);
    }
  }, [isLoading, repos, router]);

  return (
    <AppShell crumb={[{ label: t("crumb") }]}>
      <PageContainer title={t("title")} subtitle={t("subtitle")}>
        {isLoading ? (
          <div className="flex max-w-[480px] flex-col gap-3">
            <Skeleton className="h-5 w-60" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError || !repos || repos.length === 0 ? (
          <EmptyState
            icon="GitBranch"
            title={t("empty.title")}
            body={t("empty.body")}
            cta={t("empty.cta")}
            onCta={() => router.push("/onboarding")}
          />
        ) : (
          <div>
            <p className="mb-3.5 text-muted-foreground">{t("redirecting")}</p>
            <Button onClick={() => router.push(`/repos/${repos[0]!.id}/pulls`)}>
              {t("open", { repo: repos[0]!.full_name })}
            </Button>
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}
