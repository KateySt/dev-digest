"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions, type SkillVersionListItem } from "@/lib/hooks/skills";
import { formatTimestamp } from "./helpers";
import { s } from "./styles";

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
      <div style={s.wrap}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
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
    <div style={s.wrap}>
      {diffing && (
        <Modal width={860} title={t("versions.diffTitle", { version: diffing.version })} onClose={() => setDiffing(null)}>
          <div style={s.diffPane}>
            <div style={s.diffCol}>
              <div style={s.diffLabel}>{t("versions.diffOld", { version: diffing.version })}</div>
              <pre style={s.diffBody}>{diffing.body}</pre>
            </div>
            <div style={s.diffCol}>
              <div style={s.diffLabel}>{t("versions.diffCurrent", { version: skill.version })}</div>
              <pre style={s.diffBody}>{skill.body}</pre>
            </div>
          </div>
        </Modal>
      )}

      {versions.map((v) => (
        <div key={v.version} style={s.row}>
          <div style={s.info}>
            <span style={s.version}>{t("preview.version", { version: v.version })}</span>
            <span style={s.date}>{formatTimestamp(v.created_at)}</span>
            {v.current && <Badge color="var(--ok)">{t("versions.currentBadge")}</Badge>}
          </div>
          {!v.current && (
            <div style={s.actions}>
              <Button kind="ghost" size="sm" icon="Eye" onClick={() => setDiffing(v)}>
                {t("versions.diff")}
              </Button>
              <Button
                kind="secondary"
                size="sm"
                icon="RefreshCw"
                onClick={() => restoreVersion(v.version)}
                disabled={restore.isPending}
              >
                {t("versions.restore")}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
