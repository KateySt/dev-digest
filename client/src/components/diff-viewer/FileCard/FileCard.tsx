/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count, finding dot) and, when open, its parsed lines plus any outdated
   comments / unanchored findings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, SEV } from "@devdigest/ui";
import type { PrFile, Severity } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { findingsForPath, partitionFindings, type DiffFindingApi } from "../findings";
import { s, chevronFor } from "../styles";
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
  React.useEffect(() => {
    if (isTargetFile) targetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Runs once on mount — DiffTab remounts fresh whenever the Overview tab's
    // "jump to file" switches the active tab, so there's no later prop change
    // to react to here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {worst && (
          <span title={`${fileFindings.length} finding(s), worst severity ${worst}`}>
            <Badge dot color={SEV[worst].c} bg="transparent" style={{ padding: 0 }}>
              {fileFindings.length}
            </Badge>
          </span>
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
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
            <div style={s.groupBody /* reuse simple stack spacing */}>
              <div style={{ ...s.groupHeader, cursor: "default", padding: "8px 14px 0 58px" }}>
                <span style={s.findingSeverityLabel}>
                  {tFindings("diffFindings.unanchored", { count: unanchoredFindings.length })}
                </span>
              </div>
              {unanchoredFindings.map((f) => (
                <div key={f.id} style={s.findingBlock}>
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
