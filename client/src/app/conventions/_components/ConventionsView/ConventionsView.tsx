"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/contexts";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { acceptedCandidates } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { activeRepo, repoId, reposLoaded } = useActiveRepo();
  const { data: conventions, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const update = useUpdateConvention();
  const [showCreateModal, setShowCreateModal] = React.useState(false);

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
  const accepted = acceptedCandidates(list);
  const hasScanned = list.length > 0;

  const runExtraction = () => {
    if (repoId) extract.mutate(repoId);
  };

  const setStatus = (id: string, status: "pending" | "accepted" | "rejected") => {
    if (!repoId) return;
    update.mutate({ repoId, id, patch: { status } });
  };

  const saveRule = (id: string, rule: string) => {
    if (!repoId) return;
    update.mutate({ repoId, id, patch: { rule } });
  };

  const deselectAll = () => {
    for (const c of accepted) setStatus(c.id, "pending");
  };

  return (
    <AppShell crumb={crumb}>
      {showCreateModal && repoId && (
        <CreateSkillModal
          repoFullName={activeRepo?.full_name ?? repoId}
          accepted={accepted}
          onClose={() => setShowCreateModal(false)}
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
            {accepted.length > 0 && (
              <Button kind="primary" icon="Sparkles" onClick={() => setShowCreateModal(true)}>
                {t("page.createSkill")}
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
                <span style={s.candidateCount}>{t("page.acceptedCount", { accepted: accepted.length, total: list.length })}</span>
              </div>
              {accepted.length > 0 && (
                <button style={s.deselectAll} onClick={deselectAll}>
                  {t("page.deselectAll")}
                </button>
              )}
            </div>

            <div style={s.list}>
              {list.map((c) => (
                <ConventionCard
                  key={c.id}
                  candidate={c}
                  busy={update.isPending}
                  onAccept={() => setStatus(c.id, "accepted")}
                  onReject={() => setStatus(c.id, "rejected")}
                  onSaveRule={(rule) => saveRule(c.id, rule)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
