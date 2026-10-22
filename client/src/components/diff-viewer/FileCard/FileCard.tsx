/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count, finding dot) and, when open, its parsed lines plus any outdated
   comments / unanchored findings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { SEVERITY_STYLE } from "@/components/severity";
import { cn } from "@/lib/utils";
import type { PrFile, Severity } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES, CHEVRON, FINDING_BLOCK, SEVERITY_LABEL, SEVERITY_LABEL_KEYS } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { findingsForPath, partitionFindings, type DiffFindingApi } from "../findings";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import type { RiskAnnotationsByFile } from "../RiskAnnotationCard";
import type { FindingRecord } from "@devdigest/shared";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Highest-priority severity present, for the header's dot-indicator color. */
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
function worstSeverity(findings: FindingRecord[]): Severity | null {
  let worst: Severity | null = null;
  for (const f of findings) {
    const sev = f.severity as Severity;
    if (worst == null || SEVERITY_RANK[sev] < SEVERITY_RANK[worst]) worst = sev;
  }
  return worst;
}

export function FileCard({
  file,
  commenting,
  findings,
  targetFile,
  targetLine,
  riskAnnotations,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** Deep-link target (e.g. from an Overview risk's file ref) — when this
   *  file matches, its target line scrolls into view + flashes. */
  targetFile?: string | null;
  targetLine?: number | null;
  /** Every PR risk's file_ref, resolved to file+line — rendered inline
   *  wherever it lands, independent of `targetFile`/`targetLine`, so risks
   *  are visible the moment this tab opens (no click-through required). */
  riskAnnotations?: RiskAnnotationsByFile;
}) {
  const t = useTranslations("shell");
  const tFindings = useTranslations("prReview");
  const isTargetFile = !!targetFile && file.path === targetFile;
  const fileRisks = riskAnnotations?.get(file.path);
  const hasFileRisks = !!fileRisks && fileRisks.size > 0;
  const [open, setOpen] = React.useState(
    isTargetFile || hasFileRisks || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const targetRef = React.useRef<HTMLDivElement | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount, see comment above
  React.useEffect(() => {
    if (isTargetFile) targetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Runs once on mount — DiffTab remounts fresh whenever the Overview tab's
    // "jump to file" switches the active tab, so there's no later prop change
    // to react to here.
  }, []);

  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  // Same split for findings anchored to this file (start_line, RIGHT side).
  const fileFindings = findings ? findingsForPath(findings.findings, file.path) : [];
  const { matched: matchedFindings, unanchored: unanchoredFindings } = React.useMemo(() => {
    if (fileFindings.length === 0) return { matched: new Map<string, FindingRecord[]>(), unanchored: [] };
    return partitionFindings(fileFindings, renderedKeys);
  }, [fileFindings, renderedKeys]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  const worst = worstSeverity(fileFindings);

  return (
    <div className="overflow-hidden rounded-[7px] border border-border bg-elevated">
      <div onClick={() => setOpen((o) => !o)} className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
        <Icon.ChevronRight size={13} className={cn(CHEVRON, open && "rotate-90")} aria-hidden />
        <Icon.FileText size={14} className="text-subtle-foreground" aria-hidden />
        <span className="mono min-w-0 flex-1 truncate text-sm font-medium">{file.path}</span>
        <span className="mono tnum text-xs">
          <span className="text-code-add-text">+{file.additions}</span>{" "}
          <span className="text-code-del-text">−{file.deletions}</span>
        </span>
        {worst && (
          <span
            title={tFindings("diffFindings.fileSummary", {
              count: fileFindings.length,
              severity: tFindings(`diffFindings.${SEVERITY_LABEL_KEYS[worst]}`),
            })}
            className={cn("inline-flex items-center gap-1.5 text-xs font-medium", SEVERITY_STYLE[worst].text)}
          >
            <span aria-hidden className={cn("size-1.5 rounded-full", SEVERITY_STYLE[worst].fill)} />
            {fileFindings.length}
          </span>
        )}
        {commentCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-subtle-foreground">
            <Icon.MessageSquare size={12} aria-hidden />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div className="border-t border-border bg-surface py-2">
          {lines.length === 0 ? (
            <div className="px-4.5 py-3.5 text-center text-sm text-subtle-foreground">{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => {
              const isTargetLine = isTargetFile && targetLine != null && ln.newNo === targetLine;
              return (
                <CodeLine
                  key={i}
                  ln={ln}
                  path={file.path}
                  threads={threadsForLine(ln, matched)}
                  commenting={commenting}
                  findings={findings}
                  findingsForLine={keysForLine(ln).flatMap((k) => matchedFindings.get(k) ?? [])}
                  highlight={isTargetLine}
                  anchorRef={isTargetLine ? targetRef : undefined}
                  riskAnnotation={ln.newNo != null ? (fileRisks?.get(ln.newNo) ?? null) : null}
                />
              );
            })
          )}
          {commenting && commenting.showComments && (
            <OutdatedComments threads={outdated} commenting={commenting} />
          )}
          {findings && findings.showFindings && unanchoredFindings.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5 pt-2 pr-3.5 pl-14.5">
                <span className={SEVERITY_LABEL}>
                  {tFindings("diffFindings.unanchored", { count: unanchoredFindings.length })}
                </span>
              </div>
              {unanchoredFindings.map((f) => (
                <div key={f.id} className={FINDING_BLOCK}>
                  {findings.renderFinding(f)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
