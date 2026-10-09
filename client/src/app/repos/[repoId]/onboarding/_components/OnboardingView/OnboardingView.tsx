"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
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
import { s } from "./styles";

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
  const crumb = [{ label: repoName, mono: true }, { label: t("title") }];

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
        <div style={s.page}>
          <Skeleton height={28} width={320} />
          <div style={{ height: 16 }} />
          <Skeleton height={16} width={260} />
          <div style={{ height: 20 }} />
          <Skeleton height={300} />
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
        <div style={s.page}>
          <div style={s.centerFill}>
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
        <div style={s.page}>
          <div style={{ ...s.centerFill, flexDirection: "column", gap: 12 }}>
            <EmptyState
              icon="Target"
              title={t("empty.noTour.title")}
              body={t("empty.noTour.body")}
              cta={t("generate")}
              ctaLoading={isGenerating}
              onCta={handleGenerate}
            />
            {errorText && <div style={s.generateError}>{errorText}</div>}
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
      <div style={s.page}>
        <div style={s.pageHeader}>
          <div>
            <div style={s.eyebrow}>{t("title")}</div>
            <h1 style={s.pageTitle}>{repoName}</h1>
            <p style={s.pageSubtitle}>
              <span>{t("subtitle", { indexed: tour.files_indexed, discovered: tour.files_discovered, age: relAge })}</span>
              {isPartialIndex(tour) && (
                <Badge color="var(--warn)" icon="AlertTriangle">
                  {t("partialIndexMarker")}
                </Badge>
              )}
            </p>
          </div>
          <div style={s.headerActions}>
            <Button kind="secondary" icon="RefreshCw" loading={isGenerating} disabled={isGenerating} onClick={handleGenerate}>
              {isGenerating ? t("regenerating") : t("regenerate")}
            </Button>
          </div>
        </div>

        {errorText && <div style={s.generateError}>{errorText}</div>}

        <DegradedBanner indexReason={tour.index_degraded_reason} modelReason={tour.model_failure_reason} />

        <SkillSuggestionsCard repoId={repoId} />

        <div style={s.layout}>
          <AnchorNav
            label={t("anchorNav.label")}
            items={SECTION_ORDER.map(({ id, key }) => ({ id, label: t(`sections.${key}.heading`) }))}
          />
          <div style={s.sections}>
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
