"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MonoLink } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import type { OnboardingCriticalPathEntry } from "@/lib/types";

/**
 * Critical paths (C-AC-11, C-AC-15/C-AC-18's empty state): one row per
 * chain, rendered `a → b → c` in monospace, its reason alongside, plus a
 * file-open action for the chain's terminal file — built through
 * `githubBlobUrl` (C-AC-12), never a hand-assembled URL string.
 */
export function CriticalPathsSection({
  entries,
  repoFullName,
  blobRef,
}: {
  entries: OnboardingCriticalPathEntry[];
  repoFullName: string | null;
  blobRef: string;
}) {
  const t = useTranslations("onboarding.sections.criticalPaths");
  if (entries.length === 0) return <div style={s.empty}>{t("empty")}</div>;

  return (
    <div style={s.list}>
      {entries.map((entry, i) => {
        const chainText = entry.chain.join(" → ");
        const targetPath = entry.chain[entry.chain.length - 1] ?? entry.chain[0] ?? "";
        return (
          <div key={`${chainText}-${i}`} style={s.row}>
            <span className="mono" style={s.chain}>
              {chainText}
            </span>
            {entry.reason && <span style={s.reason}>{entry.reason}</span>}
            {repoFullName && targetPath && (
              <span style={s.openLink}>
                <MonoLink wrap href={githubBlobUrl(repoFullName, blobRef, targetPath)}>
                  {t("openFile", { path: targetPath })}
                </MonoLink>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const s = {
  list: { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 } as React.CSSProperties,
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    minWidth: 0,
  } as React.CSSProperties,
  chain: {
    fontSize: 13,
    color: "var(--text-primary)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } as React.CSSProperties,
  reason: { fontSize: 13, color: "var(--text-secondary)" } as React.CSSProperties,
  openLink: { minWidth: 0 } as React.CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "4px 0" } as React.CSSProperties,
};

export default CriticalPathsSection;
