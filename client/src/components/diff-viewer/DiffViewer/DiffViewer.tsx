/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline.
   Optional `groups` (Smart Diff): when present, files render inside
   role-grouped FileGroups ("Smart order") instead of this flat list — the
   flat list IS "Original order", there is no second flat code path. */
"use client";

import { useTranslations } from "next-intl";
import type { PrFile, SmartDiffGroup } from "@/lib/types";
import type { DiffCommentApi } from "../comments";
import type { DiffFindingApi } from "../findings";
import { ROLE_ORDER } from "../constants";
import { FileCard } from "../FileCard";
import { FileGroup } from "../FileGroup";
import type { RiskAnnotationsByFile } from "../RiskAnnotationCard";

export function DiffViewer({
  files,
  commenting,
  findings,
  groups,
  targetFile,
  targetLine,
  riskAnnotations,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** Inline-findings API — optional, drives the finding dot/bar/cards. */
  findings?: DiffFindingApi;
  /** Smart Diff's role groups ("Smart order"). Omit (or pass while loading /
   *  on error) to fall back to the flat "Original order" list below. */
  groups?: SmartDiffGroup[];
  /** Deep-link target (e.g. from an Overview risk's file ref) — the matching
   *  file force-expands and the line scrolls+highlights. */
  targetFile?: string | null;
  targetLine?: number | null;
  /** Every PR risk's file_ref, resolved to file+line — shown inline as soon
   *  as this tab opens, independent of the deep-link target above. */
  riskAnnotations?: RiskAnnotationsByFile;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div className="p-6 text-center text-base text-subtle-foreground">{t("diffViewer.noChangedFiles")}</div>;
  }

  if (groups) {
    const filesByPath = new Map(files.map((f) => [f.path, f]));
    const byRole = new Map(groups.map((g) => [g.role, g]));
    return (
      <div className="flex flex-col gap-2.5">
        {ROLE_ORDER.map((role) => {
          const group = byRole.get(role);
          if (!group) return null;
          return (
            <FileGroup
              key={role}
              group={group}
              filesByPath={filesByPath}
              commenting={commenting}
              findings={findings}
              targetFile={targetFile}
              targetLine={targetLine}
              riskAnnotations={riskAnnotations}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {files.map((f, i) => (
        <FileCard
          key={i}
          file={f}
          commenting={commenting}
          findings={findings}
          targetFile={targetFile}
          targetLine={targetLine}
          riskAnnotations={riskAnnotations}
        />
      ))}
    </div>
  );
}
