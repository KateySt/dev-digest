"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveRepo } from "@/lib/contexts";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { UsedSkillGroup } from "./_components/UsedSkillGroup";
import { groupConventions, pruneSelection } from "./helpers";

const PAGE = "mx-auto max-w-[920px] px-7 pt-6 pb-11";
const SECTION = "mb-7 flex flex-col gap-3";
const SECTION_HEADER = "flex items-center gap-3";
const H2 = "m-0 text-md font-semibold";
const COUNT = "text-sm text-subtle-foreground";
const LIST = "flex flex-col gap-3.5";
const LINK_BUTTON =
  "cursor-pointer border-none bg-transparent p-0 text-sm text-muted-foreground underline disabled:cursor-default disabled:opacity-50";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { activeRepo, repoId, reposLoaded } = useActiveRepo();
  const { data: conventions, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const update = useUpdateConvention();
  // Selection for the next skill is UI state only — never a status change
  // (SPEC-2026-10-16-convention-skills AC-14). The modal remembers the repo it
  // was opened for, so switching the active repo closes it.
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [modalRepoId, setModalRepoId] = React.useState<string | null>(null);
  const [showRejected, setShowRejected] = React.useState(false);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (reposLoaded && !repoId) {
    return (
      <AppShell crumb={crumb}>
        <div className={PAGE}>
          <EmptyState icon="GitBranch" title={t("page.noRepo.title")} body={t("page.noRepo.body")} />
        </div>
      </AppShell>
    );
  }

  const list = conventions ?? [];
  const groups = groupConventions(list);
  // Derived, so ids that stopped being "ready" (used, un-accepted, refetched
  // after a 409) drop out of what the modal and the counter see.
  const selectedList = groups.ready.filter((c) => selected.has(c.id));
  const usedCount = groups.used.reduce((n, g) => n + g.items.length, 0);
  const hasScanned = list.length > 0;
  const showModal = modalRepoId !== null && modalRepoId === repoId && selectedList.length > 0;

  const runExtraction = () => {
    if (repoId) extract.mutate(repoId);
  };

  const patch = (id: string, body: { status?: ConventionStatus; rule?: string; skill_id?: null }) => {
    if (!repoId) return;
    update.mutate({ repoId, id, patch: body });
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(pruneSelection(prev, groups.ready));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAll = () => setSelected(new Set(groups.ready.map((c) => c.id)));
  const clearSelection = () => setSelected(new Set());

  const card = (c: ConventionCandidate, selectable = false) => (
    <ConventionCard
      key={c.id}
      candidate={c}
      busy={update.isPending}
      onAccept={() => patch(c.id, { status: "accepted" })}
      onReject={() => patch(c.id, { status: "rejected" })}
      onUnlink={() => patch(c.id, { skill_id: null })}
      onSaveRule={(rule) => patch(c.id, { rule })}
      {...(selectable ? { selected: selected.has(c.id), onToggleSelected: () => toggle(c.id) } : {})}
    />
  );

  return (
    <AppShell crumb={crumb}>
      {showModal && repoId && (
        <CreateSkillModal
          repoId={repoId}
          repoFullName={activeRepo?.full_name ?? repoId}
          selected={selectedList}
          onClose={() => setModalRepoId(null)}
          onCreated={clearSelection}
        />
      )}
      <div className={PAGE}>
        <div className="mb-1.5 flex items-start gap-3.5">
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-[-0.02em]">
              {t("page.headingPrefix")}
              {activeRepo?.full_name ?? t("page.repoFallback")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("page.subtitle")}</p>
          </div>
          <div className="flex shrink-0 gap-2.5">
            <Button variant="secondary" onClick={runExtraction} disabled={extract.isPending || !repoId}>
              <Icon.RefreshCw className={extract.isPending ? "animate-dd-spin" : undefined} aria-hidden />
              {extract.isPending ? t("page.scanning") : hasScanned ? t("page.rescan") : t("page.runExtraction")}
            </Button>
            {groups.ready.length > 0 && (
              <Button onClick={() => setModalRepoId(repoId)} disabled={selectedList.length === 0}>
                <Icon.Sparkles aria-hidden />
                {t("page.createSkill", { count: selectedList.length })}
              </Button>
            )}
          </div>
        </div>

        {extract.isError && <ErrorState body={t("page.extractionFailed")} onRetry={runExtraction} />}

        {isLoading && (
          <div className={LIST}>
            <Skeleton className="h-35 w-full" />
            <Skeleton className="h-35 w-full" />
            <Skeleton className="h-35 w-full" />
          </div>
        )}

        {isError && !isLoading && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}

        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={runExtraction}
          />
        )}

        {!isLoading && !isError && list.length > 0 && (
          <>
            <div className="mt-4.5 mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={COUNT}>{t("page.candidateCount", { count: list.length })}</span>
                <span className={COUNT}>
                  {t("page.acceptedCount", { ready: groups.ready.length, used: usedCount })}
                </span>
              </div>
            </div>

            {groups.ready.length > 0 && (
              <section className={SECTION} aria-label={t("sections.ready")}>
                <div className={SECTION_HEADER}>
                  <h2 className={H2}>{t("sections.ready")}</h2>
                  <span className={COUNT}>{t("selection.count", { count: selectedList.length })}</span>
                  <div className="ml-auto flex gap-3">
                    <button type="button" className={LINK_BUTTON} onClick={selectAll}>
                      {t("selection.selectAll")}
                    </button>
                    <button type="button" className={LINK_BUTTON} onClick={clearSelection} disabled={selectedList.length === 0}>
                      {t("selection.clear")}
                    </button>
                  </div>
                </div>
                <p className="m-0 text-sm text-muted-foreground">{t("sections.readyHint")}</p>
                <div className={LIST}>{groups.ready.map((c) => card(c, true))}</div>
              </section>
            )}

            {groups.toReview.length > 0 && (
              <section className={SECTION} aria-label={t("sections.toReview")}>
                <h2 className={H2}>{t("sections.toReview")}</h2>
                <div className={LIST}>{groups.toReview.map((c) => card(c))}</div>
              </section>
            )}

            {groups.used.length > 0 && (
              <section className={SECTION} aria-label={t("sections.used")}>
                <h2 className={H2}>{t("sections.used")}</h2>
                {groups.used.map((g) => (
                  <UsedSkillGroup key={g.skill.id} skill={g.skill} items={g.items} renderItem={(c) => card(c)} />
                ))}
              </section>
            )}

            {groups.rejected.length > 0 && (
              <section className={SECTION} aria-label={t("sections.rejected", { count: groups.rejected.length })}>
                <div className={SECTION_HEADER}>
                  <h2 className={H2}>{t("sections.rejected", { count: groups.rejected.length })}</h2>
                  <button
                    type="button"
                    className={LINK_BUTTON}
                    onClick={() => setShowRejected((v) => !v)}
                    aria-expanded={showRejected}
                  >
                    {showRejected ? t("sections.hideRejected") : t("sections.showRejected")}
                  </button>
                </div>
                {showRejected && <div className={LIST}>{groups.rejected.map((c) => card(c))}</div>}
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
