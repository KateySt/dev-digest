"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/contexts";
import { ApiError } from "@/lib/api";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding";
import { SectionCard } from "./_components/SectionCard";
import { AnchorNav } from "./_components/AnchorNav";
import { DegradedBanner } from "./_components/DegradedBanner";
import { ArchitectureSection } from "./_components/ArchitectureSection";
import { CriticalPathsSection } from "./_components/CriticalPathsSection";
import { RunLocallySection } from "./_components/RunLocallySection";
import { ReadingPathSection } from "./_components/ReadingPathSection";
import { FirstTasksSection } from "./_components/FirstTasksSection";
import { SkillSuggestionsCard } from "./_components/SkillSuggestionsCard";
import { POLL_CEILING_MS } from "./constants";
import { formatRelativeAge, isPartialIndex, SECTION_ORDER } from "./helpers";

/**
 * The repo-scoped Onboarding Tour page (SPEC-06, C-AC-1..30). `page.tsx`
 * stays thin and delegates here, per this module's structure convention
 * (same shape as `ProjectContextView`).
 */
export function OnboardingView() {
  const t = useTranslations("onboarding");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  // Poll only while a generation we started is in flight (C-AC-20, C-AC-23)
  // — a read alone never polls. Completion is detected by `generated_at`
  // ADVANCING past the value captured right before this click, not a
  // status enum (mirrors `useRepoIntelStatus`'s `lastIndexedSha` approach).
  const [polling, setPolling] = React.useState(false);
  const [pendingBaseline, setPendingBaseline] = React.useState<string | null | undefined>(undefined);
  const [generateError, setGenerateError] = React.useState<string | null>(null);
  const [timedOut, setTimedOut] = React.useState(false);

  const { data, isLoading, isError, refetch } = useOnboardingTour(repoId, polling);
  const generate = useGenerateOnboardingTour(repoId);

  const currentGeneratedAt = data && data.state === "generated" ? data.generated_at : null;

  React.useEffect(() => {
    if (!polling || pendingBaseline === undefined) return;
    if (currentGeneratedAt !== pendingBaseline) {
      setPolling(false);
      setPendingBaseline(undefined);
    }
  }, [polling, pendingBaseline, currentGeneratedAt]);

  // C-AC-31/32: a generation that never produces a new tour (e.g. the job
  // died) must not poll forever — stop at the ceiling, say so, and let the
  // user regenerate. The existing tour (or empty state) is left untouched.
  React.useEffect(() => {
    if (!polling) return;
    const id = setTimeout(() => {
      setPolling(false);
      setPendingBaseline(undefined);
      setTimedOut(true);
    }, POLL_CEILING_MS);
    return () => clearTimeout(id);
  }, [polling]);

  const isGenerating = polling || generate.isPending;
  const errorText = timedOut
    ? t("generateTimedOut")
    : generateError
      ? t("generateFailed", { message: generateError })
      : null;

  const handleGenerate = () => {
    setGenerateError(null);
    setTimedOut(false);
    setPendingBaseline(currentGeneratedAt);
    setPolling(true);
    generate.mutate(undefined, {
      onSuccess: (res) => {
        if (!res.jobId) {
          // Enqueue itself was refused/degraded (no_clone / no_handler) —
          // nothing to poll for; surface it and leave any existing tour
          // fully intact (C-AC-24).
          setPolling(false);
          setPendingBaseline(undefined);
          setGenerateError(res.reason ?? t("unknownError"));
        }
      },
      onError: (err) => {
        setPolling(false);
        setPendingBaseline(undefined);
        setGenerateError(err instanceof ApiError ? err.message : t("unknownError"));
      },
    });
  };

  const repoName = activeRepo?.full_name ?? repoId;
  const repoFullName = activeRepo?.full_name ?? null;
  // Empty while repos load — the breadcrumb shows a skeleton, never the raw id.
  const crumb = [{ label: activeRepo?.full_name ?? "", mono: true }, { label: t("title") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  // Distinguish "not yet resolved" (isLoading, `data` is still undefined)
  // from "confirmed" states below — collapsing these with a falsy check on
  // `data` would flash the empty state over a tour that's still fetching
  // (client/INSIGHTS.md's recorded lesson on exactly this class of bug).
  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div className="mx-auto box-border max-w-[1080px] px-8 pt-6 pb-15">
          <Skeleton className="h-7 w-80" />
          <Skeleton className="mt-4 h-4 w-65" />
          <Skeleton className="mt-5 h-75 w-full" />
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("loadError.title")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  if (data.state === "no_clone") {
    return (
      <AppShell crumb={crumb}>
        <div className="mx-auto box-border max-w-[1080px] px-8 pt-6 pb-15">
          <div className="flex min-h-[50vh] items-center justify-center">
            <EmptyState icon="GitBranch" title={t("empty.noClone.title")} body={t("empty.noClone.body")} />
          </div>
          {/* C-AC-37: suggestions depend only on repos.languages, not on a
              generated tour or even a local clone — render on every page
              state, below the centered empty-state content. */}
          <SkillSuggestionsCard repoId={repoId} />
        </div>
      </AppShell>
    );
  }

  if (data.state === "not_generated") {
    return (
      <AppShell crumb={crumb}>
        <div className="mx-auto box-border max-w-[1080px] px-8 pt-6 pb-15">
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
            <EmptyState
              icon="Target"
              title={t("empty.noTour.title")}
              body={t("empty.noTour.body")}
              cta={t("generate")}
              ctaLoading={isGenerating}
              onCta={handleGenerate}
            />
            {errorText && <div className="mb-4 rounded-lg border border-crit bg-crit-bg px-3.5 py-2.5 text-sm text-crit">{errorText}</div>}
          </div>
          {/* C-AC-37: see the no_clone branch above for why this is rendered
              here too, not only in the "generated" state. */}
          <SkillSuggestionsCard repoId={repoId} />
        </div>
      </AppShell>
    );
  }

  // data.state === "generated"
  const tour = data;
  const relAge = formatRelativeAge(tour.generated_at) ?? "";

  return (
    <AppShell crumb={crumb}>
      <div className="mx-auto box-border max-w-[1080px] px-8 pt-6 pb-15">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 text-2xs font-bold tracking-[0.08em] text-subtle-foreground uppercase">{t("title")}</div>
            <h1 className="m-0 text-3xl font-bold">{repoName}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-base text-muted-foreground">
              <span>{t("subtitle", { indexed: tour.files_indexed, discovered: tour.files_discovered, age: relAge })}</span>
              {isPartialIndex(tour) && (
                <Badge variant="warn">
                  <Icon.AlertTriangle aria-hidden />
                  {t("partialIndexMarker")}
                </Badge>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" disabled={isGenerating} onClick={handleGenerate}>
              <Icon.RefreshCw className={isGenerating ? "animate-dd-spin" : undefined} aria-hidden />
              {isGenerating ? t("regenerating") : t("regenerate")}
            </Button>
          </div>
        </div>

        {errorText && <div className="mb-4 rounded-lg border border-crit bg-crit-bg px-3.5 py-2.5 text-sm text-crit">{errorText}</div>}

        <DegradedBanner indexReason={tour.index_degraded_reason} modelReason={tour.model_failure_reason} />

        <SkillSuggestionsCard repoId={repoId} />

        {/* minmax(0, …) tracks so a long unbroken path in the sections column can't
            widen the grid past the page edge (client/INSIGHTS.md 2026-09-24). */}
        <div className="grid grid-cols-[minmax(0,200px)_minmax(0,1fr)] items-start gap-6">
          <AnchorNav
            label={t("anchorNav.label")}
            items={SECTION_ORDER.map(({ id, key }) => ({ id, label: t(`sections.${key}.heading`) }))}
          />
          <div className="flex min-w-0 flex-col gap-4">
            {SECTION_ORDER.map(({ id, key, icon }) => {
              const heading = t(`sections.${key}.heading`);
              return (
                <SectionCard
                  key={id}
                  id={id}
                  icon={icon}
                  heading={heading}
                  expandLabel={t("collapse.expand", { section: heading })}
                  collapseLabel={t("collapse.collapse", { section: heading })}
                >
                  {key === "architecture" && (
                    <ArchitectureSection
                      architectureMd={tour.architecture_md}
                      diagramSource={tour.diagram_source}
                      diagramNodes={tour.diagram_nodes}
                      diagramEdges={tour.diagram_edges}
                    />
                  )}
                  {key === "criticalPaths" && (
                    <CriticalPathsSection entries={tour.critical_paths} repoFullName={repoFullName} blobRef={tour.blob_ref} />
                  )}
                  {key === "runLocally" && <RunLocallySection commands={tour.run_commands} />}
                  {key === "readingPath" && <ReadingPathSection entries={tour.reading_path} />}
                  {key === "firstTasks" && <FirstTasksSection firstTasksMd={tour.first_tasks_md} />}
                </SectionCard>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default OnboardingView;
