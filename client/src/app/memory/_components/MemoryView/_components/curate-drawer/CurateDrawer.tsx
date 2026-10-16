/* Curate drawer (SPEC-2026-10-12-memory-curation). Opens only from the Curate
   click and scans once on open — a dry run. Each proposal is applied (or
   skipped) on its own; there is deliberately no "apply all" (AC-C9). Handled
   proposals disappear without a re-scan (AC-C21). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { LinkOption } from "@/components/memory-form";
import { useCurateScan } from "@/lib/hooks/memory";
import { MergeGroup } from "./_components/merge-group";
import { StaleItem } from "./_components/stale-item";
import { s } from "./styles";

export function CurateDrawer({
  repoId,
  agentOptions,
  skillOptions,
  onClose,
  onOpenMemory,
}: {
  repoId: string | null;
  agentOptions: LinkOption[];
  skillOptions: LinkOption[];
  onClose: () => void;
  onOpenMemory: (id: string) => void;
}) {
  const t = useTranslations("memory.curate");
  // The drawer is only mounted by the Curate click, so the scan is still click-triggered.
  const { data: scanned, error, isFetching, refetch } = useCurateScan(repoId);
  // Proposals the user already applied or skipped, keyed `g:<primary>` / `s:<memory>`.
  const [handled, setHandled] = React.useState<ReadonlySet<string>>(new Set());
  const [conflict, setConflict] = React.useState(false);

  const scan = () => {
    setHandled(new Set());
    setConflict(false);
    void refetch();
  };

  // While (re-)scanning show progress, not the previous snapshot.
  const data = isFetching ? undefined : scanned;

  const done = (key: string) => setHandled((cur) => new Set(cur).add(key));
  const groups = data?.groups.filter((g) => !handled.has(`g:${g.primary_id}`)) ?? [];
  const stale = data?.stale.filter((c) => !handled.has(`s:${c.memory.id}`)) ?? [];

  return (
    <Drawer width={760} title={t("title")} subtitle={t("subtitle")} onClose={onClose}>
      {data ? (
        <div style={s.body}>
          {conflict && (
            <div role="status" style={s.notice}>
              <span>{t("conflict")}</span>
              <Button kind="secondary" size="sm" onClick={scan}>
                {t("rescan")}
              </Button>
            </div>
          )}
          {data.groups.length === 0 && data.stale.length === 0 ? (
            <EmptyState icon="Brain" title={t("clean")} body={t("cleanBody")} />
          ) : (
            <>
              <section style={s.section}>
                <div style={s.sectionHead}>
                  <h3 style={s.sectionTitle}>{t("duplicates", { count: groups.length })}</h3>
                  {data.totals.groups > data.groups.length && (
                    <span>{t("showing", { shown: data.groups.length, total: data.totals.groups })}</span>
                  )}
                </div>
                {groups.map((g) => (
                  <MergeGroup
                    key={g.primary_id}
                    group={g}
                    repoId={repoId}
                    agentOptions={agentOptions}
                    skillOptions={skillOptions}
                    onDone={() => done(`g:${g.primary_id}`)}
                    onConflict={() => setConflict(true)}
                  />
                ))}
              </section>
              <section style={s.section}>
                <div style={s.sectionHead}>
                  <h3 style={s.sectionTitle}>{t("stale", { count: stale.length })}</h3>
                  {data.totals.stale > data.stale.length && (
                    <span>{t("showing", { shown: data.stale.length, total: data.totals.stale })}</span>
                  )}
                </div>
                {stale.map((c) => (
                  <StaleItem
                    key={c.memory.id}
                    candidate={c}
                    repoId={repoId}
                    agentOptions={agentOptions}
                    skillOptions={skillOptions}
                    onDone={() => done(`s:${c.memory.id}`)}
                  />
                ))}
              </section>
            </>
          )}
        </div>
      ) : error && !isFetching ? (
        <ErrorState title={t("scanError")} onRetry={scan} />
      ) : (
        <div style={s.center} aria-busy={isFetching}>
          <span>{t("scanning")}</span>
          <Skeleton height={120} />
        </div>
      )}
    </Drawer>
  );
}
