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
import { EmptyState, MonoLink } from "@devdigest/ui";
import { usePrCommits } from "@/lib/hooks/reviews";
import { FILE_SEVERITY_COLOR } from "./constants";
import { s } from "./styles";

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
    return <div style={s.placeholderHint}>{t("empty")}</div>;
  }

  return (
    <div style={s.wrap}>
      {data.commits.map((commit) => (
        <div key={commit.sha} style={s.commitCard}>
          <div style={s.commitHeader}>
            <span className="mono" style={s.sha}>
              {commit.sha.slice(0, 7)}
            </span>
            <span style={s.message}>{commit.message.split("\n")[0]}</span>
          </div>
          <div style={s.meta}>
            {commit.author}
            {commit.committed_at ? ` · ${new Date(commit.committed_at).toLocaleDateString()}` : ""}
            {" · "}
            {t("fileCount", { count: commit.files.length })}
          </div>
          {commit.files.length > 0 && (
            <div style={s.fileList}>
              {commit.files.map((file) => (
                <div
                  key={file.path}
                  style={s.fileRow(file.severity ? FILE_SEVERITY_COLOR[file.severity] : null)}
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
