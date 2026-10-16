/* CommitHistoryPanel — the "Commits" block on the PR Overview tab: every
   commit (short sha, message, author, date) with the files it touched.
   A file the PR's latest review flagged gets a severity-colored left border
   (RiskAreasList's card-by-severity idiom) and jumps to that finding's line
   on the Files-changed tab when clicked; a file with no findings gets no
   color treatment. Data (commit → files → worst severity) is computed once
   server-side and cached forever (`usePrCommits`), never head-sha-keyed like
   the rest of the brief. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { MonoLink } from "@/components/mono-link";
import { cn } from "@/lib/utils";
import { usePrCommits } from "@/lib/hooks/reviews";
import { FILE_SEVERITY_BORDER } from "./constants";

export function CommitHistoryPanel({
  prId,
  onNavigateToFile,
}: {
  prId: string | null | undefined;
  onNavigateToFile: (path: string, line: number) => void;
}) {
  const t = useTranslations("commits");
  const { data, isLoading } = usePrCommits(prId);

  // "No data yet" (still loading) vs "confirmed empty" must stay distinct —
  // check `isLoading` first, then `!data` (fetch failed / never computed),
  // then the genuine empty-list state. Matches `BlastRadiusPanel`'s shape
  // (client/INSIGHTS.md) — never collapse with `?? []`.
  if (isLoading) return null;

  if (!data) {
    return <EmptyState icon="GitCommit" title={t("unavailable")} body={t("unavailableHint")} />;
  }

  if (data.commits.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-elevated px-4 py-3.25 text-sm text-subtle-foreground">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {data.commits.map((commit) => (
        <div key={commit.sha} className="flex flex-col gap-1.5 rounded-lg border border-border bg-elevated px-3 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="mono text-xs text-brand-text">
              {commit.sha.slice(0, 7)}
            </span>
            <span className="text-sm font-semibold text-foreground">{commit.message.split("\n")[0]}</span>
          </div>
          <div className="text-xs text-subtle-foreground">
            {commit.author}
            {commit.committed_at ? ` · ${new Date(commit.committed_at).toLocaleDateString()}` : ""}
            {" · "}
            {t("fileCount", { count: commit.files.length })}
          </div>
          {commit.files.length > 0 && (
            <div className="mt-0.5 flex flex-col gap-1">
              {commit.files.map((file) => (
                // Left-border colour marks the file's worst finding; none when it has no findings.
                <div
                  key={file.path}
                  data-severity={file.severity ?? undefined}
                  className={cn(
                    "flex items-center gap-1.5 border-l-2 pl-2",
                    file.severity ? FILE_SEVERITY_BORDER[file.severity] : "border-transparent",
                  )}
                >
                  <MonoLink onClick={() => onNavigateToFile(file.path, file.line ?? 1)}>
                    {file.path}
                  </MonoLink>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
