"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingReadingPathEntry } from "@/lib/types";

/** Guided reading path (C-AC-16): each entry's position, repo-relative
 *  path (monospace), and one-line rationale. */
export function ReadingPathSection({ entries }: { entries: OnboardingReadingPathEntry[] }) {
  const t = useTranslations("onboarding.sections.readingPath");
  if (entries.length === 0) return <div style={s.empty}>{t("empty")}</div>;

  return (
    <ol style={s.list}>
      {entries.map((e) => (
        <li key={e.position} style={s.row}>
          <span className="mono" style={s.position}>
            {e.position}
          </span>
          <div style={s.body}>
            <div className="mono" style={s.path}>
              {e.path}
            </div>
            {e.rationale && <div style={s.rationale}>{e.rationale}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const s = {
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 } as React.CSSProperties,
  row: { display: "flex", gap: 10, minWidth: 0 } as React.CSSProperties,
  position: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    flexShrink: 0,
    width: 20,
    textAlign: "right",
  } as React.CSSProperties,
  body: { minWidth: 0, flex: 1 } as React.CSSProperties,
  path: {
    fontSize: 13,
    color: "var(--text-primary)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } as React.CSSProperties,
  rationale: { fontSize: 13, color: "var(--text-secondary)", marginTop: 2 } as React.CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "4px 0" } as React.CSSProperties,
};

export default ReadingPathSection;
