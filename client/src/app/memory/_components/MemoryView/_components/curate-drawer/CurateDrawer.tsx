/* Curate drawer (SPEC-2026-10-12-memory-curation). Opens only from the Curate
   click and scans once on open — a dry run. Each proposal is applied (or
   skipped) on its own; there is deliberately no "apply all" (AC-C9). Handled
   proposals disappear without a re-scan (AC-C21). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { LinkOption } from "@/components/memory-form";
import { useCurateScan } from "@/lib/hooks/memory";
import { MergeGroup } from "./_components/merge-group";
import { StaleItem } from "./_components/stale-item";
import { CURATE_CLASSES } from "./constants";

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
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[760px] sm:max-w-[94%]">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("subtitle")}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {data ? (
            <div className="flex flex-col gap-5.5 px-0.5 py-1">
              {conflict && (
                <div role="status" className={CURATE_CLASSES.notice}>
                  <span>{t("conflict")}</span>
                  <Button variant="secondary" size="sm" onClick={scan}>
                    {t("rescan")}
                  </Button>
                </div>
              )}
              {data.groups.length === 0 && data.stale.length === 0 ? (
                <EmptyState icon="Brain" title={t("clean")} body={t("cleanBody")} />
              ) : (
                <>
                  <section className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="m-0 text-base font-semibold">{t("duplicates", { count: groups.length })}</h3>
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
                  <section className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="m-0 text-base font-semibold">{t("stale", { count: stale.length })}</h3>
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
            <div className="flex flex-col items-center gap-2 py-10" aria-busy={isFetching}>
              <span>{t("scanning")}</span>
              <Skeleton className="h-30 w-full" />
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
