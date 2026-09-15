"use client";

import React from "react";
import { SeverityBadge, CategoryTag, MonoLink, type Severity, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

export function FindingSummaryRow({
  finding,
  repoFullName,
  headSha,
}: {
  finding: FindingRecord;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const fileHref =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, finding.file, finding.start_line, finding.end_line)
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
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--text-primary)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {finding.title}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <MonoLink href={fileHref}>
          {finding.file}:{lineLabel(finding)}
        </MonoLink>
        <CategoryTag category={finding.category as Category} />
      </div>
    </div>
  );
}
