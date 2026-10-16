"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useRestoreSkillVersion, useSkillVersions, type SkillVersionListItem } from "@/lib/hooks/skills";
import { formatTimestamp } from "./helpers";

const DIFF_LABEL = "mb-1.5 text-ui font-semibold text-subtle-foreground";
const DIFF_BODY =
  "m-0 max-h-[420px] overflow-auto rounded-lg border border-border bg-elevated p-3 text-ui leading-[1.6] whitespace-pre-wrap break-words";

/** Versions tab — every body snapshot for this skill (newest first), with
 *  Diff (old body vs. current) and Restore (creates a new version with the
 *  old body — server-side `update()` handles the version bump/snapshot). */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffing, setDiffing] = React.useState<SkillVersionListItem | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;
  }

  if (!versions || versions.length === 0) {
    return <EmptyState icon="History" title={t("versions.empty.title")} body={t("versions.empty.body")} />;
  }

  const restoreVersion = (version: number) => {
    if (!window.confirm(t("versions.restoreConfirm", { version }))) return;
    restore.mutate({ id: skill.id, version });
  };

  return (
    <div className="flex flex-col gap-2">
      {diffing && (
        <Dialog open onOpenChange={(open) => !open && setDiffing(null)}>
          <DialogContent className="sm:max-w-[860px]">
            <DialogHeader>
              <DialogTitle>{t("versions.diffTitle", { version: diffing.version })}</DialogTitle>
            </DialogHeader>
            <DialogBody className="flex gap-3 px-6 py-5">
              <div className="min-w-0 flex-1">
                <div className={DIFF_LABEL}>{t("versions.diffOld", { version: diffing.version })}</div>
                <pre className={DIFF_BODY}>{diffing.body}</pre>
              </div>
              <div className="min-w-0 flex-1">
                <div className={DIFF_LABEL}>{t("versions.diffCurrent", { version: skill.version })}</div>
                <pre className={DIFF_BODY}>{skill.body}</pre>
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}

      {versions.map((v) => (
        <div key={v.version} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="text-base font-bold">{t("preview.version", { version: v.version })}</span>
            <span className="text-ui text-subtle-foreground">{formatTimestamp(v.created_at)}</span>
            {v.current && <Badge variant="ok">{t("versions.currentBadge")}</Badge>}
          </div>
          {!v.current && (
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setDiffing(v)}>
                <Icon.Eye aria-hidden />
                {t("versions.diff")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => restoreVersion(v.version)}
                disabled={restore.isPending}
              >
                <Icon.RefreshCw aria-hidden />
                {t("versions.restore")}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
