"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingReadingPathEntry } from "@/lib/types";

/** Guided reading path (C-AC-16): each entry's position, repo-relative
 *  path (monospace), and one-line rationale. */
export function ReadingPathSection({ entries }: { entries: OnboardingReadingPathEntry[] }) {
  const t = useTranslations("onboarding.sections.readingPath");
  if (entries.length === 0) return <div className="py-1 text-sm text-subtle-foreground">{t("empty")}</div>;

  return (
    <ol className="m-0 flex min-w-0 list-none flex-col gap-3 p-0">
      {entries.map((e) => (
        <li key={e.position} className="flex min-w-0 gap-2.5">
          <span className="mono w-5 shrink-0 text-right text-ui text-subtle-foreground">
            {e.position}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mono min-w-0 text-sm text-foreground wrap-anywhere break-words">
              {e.path}
            </div>
            {e.rationale && <div className="mt-0.5 text-sm text-muted-foreground">{e.rationale}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default ReadingPathSection;
