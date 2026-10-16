"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/contexts";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { UsedSkillGroup } from "./_components/UsedSkillGroup";
import { groupConventions, pruneSelection } from "./helpers";
import { s } from "./styles";

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
        <div style={s.page}>
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
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              {activeRepo?.full_name ?? t("page.repoFallback")}
            </h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.headerActions}>
            <Button
              kind="secondary"
              icon="RefreshCw"
              onClick={runExtraction}
              disabled={extract.isPending || !repoId}
            >
              {extract.isPending ? t("page.scanning") : hasScanned ? t("page.rescan") : t("page.runExtraction")}
            </Button>
            {groups.ready.length > 0 && (
              <Button
                kind="primary"
                icon="Sparkles"
                onClick={() => setModalRepoId(repoId)}
                disabled={selectedList.length === 0}
              >
                {t("page.createSkill", { count: selectedList.length })}
              </Button>
            )}
          </div>
        </div>

        {extract.isError && <ErrorState body={t("page.extractionFailed")} onRetry={runExtraction} />}

        {isLoading && (
          <div style={s.list}>
            <Skeleton height={140} />
            <Skeleton height={140} />
            <Skeleton height={140} />
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
            <div style={s.toolbar}>
              <div style={s.toolbarLeft}>
                <span style={s.candidateCount}>{t("page.candidateCount", { count: list.length })}</span>
                <span style={s.candidateCount}>
                  {t("page.acceptedCount", { ready: groups.ready.length, used: usedCount })}
                </span>
              </div>
            </div>

            {groups.ready.length > 0 && (
              <section style={s.section} aria-label={t("sections.ready")}>
                <div style={s.sectionHeader}>
                  <h2 style={s.h2}>{t("sections.ready")}</h2>
                  <span style={s.candidateCount}>{t("selection.count", { count: selectedList.length })}</span>
                  <div style={s.sectionActions}>
                    <button style={s.linkButton} onClick={selectAll}>
                      {t("selection.selectAll")}
                    </button>
                    <button style={s.linkButton} onClick={clearSelection} disabled={selectedList.length === 0}>
                      {t("selection.clear")}
                    </button>
                  </div>
                </div>
                <p style={s.sectionHint}>{t("sections.readyHint")}</p>
                <div style={s.list}>{groups.ready.map((c) => card(c, true))}</div>
              </section>
            )}

            {groups.toReview.length > 0 && (
              <section style={s.section} aria-label={t("sections.toReview")}>
                <h2 style={s.h2}>{t("sections.toReview")}</h2>
                <div style={s.list}>{groups.toReview.map((c) => card(c))}</div>
              </section>
            )}

            {groups.used.length > 0 && (
              <section style={s.section} aria-label={t("sections.used")}>
                <h2 style={s.h2}>{t("sections.used")}</h2>
                {groups.used.map((g) => (
                  <UsedSkillGroup key={g.skill.id} skill={g.skill} items={g.items} renderItem={(c) => card(c)} />
                ))}
              </section>
            )}

            {groups.rejected.length > 0 && (
              <section style={s.section} aria-label={t("sections.rejected", { count: groups.rejected.length })}>
                <div style={s.sectionHeader}>
                  <h2 style={s.h2}>{t("sections.rejected", { count: groups.rejected.length })}</h2>
                  <button
                    style={s.linkButton}
                    onClick={() => setShowRejected((v) => !v)}
                    aria-expanded={showRejected}
                  >
                    {showRejected ? t("sections.hideRejected") : t("sections.showRejected")}
                  </button>
                </div>
                {showRejected && <div style={s.list}>{groups.rejected.map((c) => card(c))}</div>}
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
