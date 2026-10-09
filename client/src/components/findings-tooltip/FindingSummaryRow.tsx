"use client";

import React from "react";
import Link from "next/link";
import { SeverityBadge, CategoryTag, MonoLink, type Severity, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

const titleStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text-primary)",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const descriptionStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--text-muted)",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const fileLinkStyle: React.CSSProperties = {
  overflowWrap: "anywhere",
};

export function FindingSummaryRow({
  finding,
  repoFullName,
  headSha,
  repoId,
  prNumber,
}: {
  finding: FindingRecord;
  repoFullName?: string | null;
  headSha?: string | null;
  repoId?: string | null;
  prNumber?: number | null;
}) {
  const fileHref =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, finding.file, finding.start_line, finding.end_line)
      : undefined;
  const findingHref =
    repoId != null && prNumber != null
      ? `/repos/${repoId}/pulls/${prNumber}?tab=findings&finding=${finding.id}`
      : undefined;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SeverityBadge severity={finding.severity as Severity} compact />
        {findingHref ? (
          <Link href={findingHref} style={{ ...titleStyle, textDecoration: "none" }}>
            <span style={{ textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }}>
              {finding.title}
            </span>
          </Link>
        ) : (
          <span style={titleStyle}>{finding.title}</span>
        )}
      </div>
      <p style={descriptionStyle}>{finding.rationale}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={fileLinkStyle}>
          <MonoLink href={fileHref}>
            {finding.file}:{lineLabel(finding)}
          </MonoLink>
        </span>
        <CategoryTag category={finding.category as Category} />
      </div>
    </div>
  );
}
