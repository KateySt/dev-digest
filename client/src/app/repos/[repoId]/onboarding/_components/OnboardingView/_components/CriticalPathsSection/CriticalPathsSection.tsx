"use client";

import { useTranslations } from "next-intl";
import { MonoLink } from "@/components/mono-link";
import { githubBlobUrl } from "@/lib/utils";
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
  if (entries.length === 0) return <div className="py-1 text-sm text-subtle-foreground">{t("empty")}</div>;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {entries.map((entry, i) => {
        const chainText = entry.chain.join(" → ");
        const targetPath = entry.chain[entry.chain.length - 1] ?? entry.chain[0] ?? "";
        return (
          <div key={`${chainText}-${i}`} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5">
            <span className="mono min-w-0 text-sm text-foreground wrap-anywhere break-words">
              {chainText}
            </span>
            {entry.reason && <span className="text-sm text-muted-foreground">{entry.reason}</span>}
            {repoFullName && targetPath && (
              <span className="min-w-0">
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

export default CriticalPathsSection;
