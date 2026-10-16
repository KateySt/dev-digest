/* FileGroup — one role bucket ("Smart order" grouping) in the Files-changed
   tab: a collapsible header (role label, file count, files-with-findings
   count) and its FileCards. Renders nothing for an empty group (the server
   always returns all 5 roles, most PRs only touch a few of them). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import type { PrFile, SmartDiffGroup } from "@/lib/types";
import {
  AUTO_EXPAND_MAX_LINES,
  CHEVRON,
  DEFAULT_COLLAPSED_ROLES,
  ROLE_DESCRIPTION_KEYS,
  ROLE_LABEL_KEYS,
} from "../constants";
import { FileCard } from "../FileCard";
import { type DiffCommentApi } from "../comments";
import { type DiffFindingApi } from "../findings";
import type { RiskAnnotationsByFile } from "../RiskAnnotationCard";

export function FileGroup({
  group,
  filesByPath,
  commenting,
  findings,
  targetFile,
  targetLine,
  riskAnnotations,
}: {
  group: SmartDiffGroup;
  /** The matching PrFile (with patch text) for each of `group.files`, keyed
   *  by path — SmartDiffFile itself carries no patch, only role/line stats. */
  filesByPath: Map<string, PrFile>;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** Deep-link target — a group containing it force-expands regardless of
   *  its role's default-collapsed setting. */
  targetFile?: string | null;
  targetLine?: number | null;
  /** A group containing any risk-annotated file also force-expands — risks
   *  should be visible without a click, same as the deep-link target. */
  riskAnnotations?: RiskAnnotationsByFile;
}) {
  const t = useTranslations("prReview");
  const files = group.files.map((f) => filesByPath.get(f.path)).filter((f): f is PrFile => !!f);

  const hasTarget = !!targetFile && group.files.some((f) => f.path === targetFile);
  const hasRisk = !!riskAnnotations && group.files.some((f) => riskAnnotations.has(f.path));
  const totalLines = group.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const defaultOpen =
    hasTarget ||
    hasRisk ||
    (DEFAULT_COLLAPSED_ROLES.has(group.role) ? false : totalLines <= AUTO_EXPAND_MAX_LINES);
  const [open, setOpen] = React.useState(defaultOpen);

  const filesWithFindingsCount = findings
    ? new Set(
        findings.findings
          .filter((f) => group.files.some((gf) => gf.path === f.file))
          .map((f) => f.file),
      ).size
    : 0;

  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div onClick={() => setOpen((o) => !o)} className="flex cursor-pointer items-center gap-2.5 py-2">
        <Icon.ChevronRight size={13} className={cn(CHEVRON, open && "rotate-90")} aria-hidden />
        <span className="shrink-0 text-ui font-bold tracking-[0.04em] text-muted-foreground uppercase">{t(`smartDiff.${ROLE_LABEL_KEYS[group.role]}`)}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-subtle-foreground">{t(`smartDiff.${ROLE_DESCRIPTION_KEYS[group.role]}`)}</span>
        <span className="shrink-0 text-xs text-subtle-foreground">{t("smartDiff.filesCount", { count: files.length })}</span>
        {filesWithFindingsCount > 0 && (
          <span className="shrink-0 text-xs text-warn">
            {t("smartDiff.filesWithFindings", { count: filesWithFindingsCount })}
          </span>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-2.5">
          {files.map((file) => (
            <FileCard
              key={file.path}
              file={file}
              commenting={commenting}
              findings={findings}
              targetFile={targetFile}
              targetLine={targetLine}
              riskAnnotations={riskAnnotations}
            />
          ))}
        </div>
      )}
    </div>
  );
}
