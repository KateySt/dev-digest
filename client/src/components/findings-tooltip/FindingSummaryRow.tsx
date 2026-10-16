"use client";

import React from "react";
import Link from "next/link";
import type { FindingRecord } from "@devdigest/shared";
import { MonoLink } from "@/components/mono-link";
import { CategoryTag, SeverityBadge, type Category, type Severity } from "@/components/severity";
import { githubBlobUrl } from "@/lib/utils";

function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

const TITLE = "line-clamp-2 text-ui font-semibold text-foreground";

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
    <div className="flex flex-col gap-1 border-t border-border px-2.5 py-2">
      <div className="flex items-center gap-2">
        <SeverityBadge severity={finding.severity as Severity} compact />
        {findingHref ? (
          <Link href={findingHref} className={`${TITLE} no-underline`}>
            <span className="underline decoration-dotted underline-offset-2">{finding.title}</span>
          </Link>
        ) : (
          <span className={TITLE}>{finding.title}</span>
        )}
      </div>
      <p className="m-0 line-clamp-2 text-xs text-subtle-foreground">{finding.rationale}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="wrap-anywhere">
          <MonoLink href={fileHref}>
            {finding.file}:{lineLabel(finding)}
          </MonoLink>
        </span>
        <CategoryTag category={finding.category as Category} />
      </div>
    </div>
  );
}
