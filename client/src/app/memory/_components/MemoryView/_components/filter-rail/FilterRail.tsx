/* Left rail of the Memory page: Scope / Kind checkboxes with facet counts,
   Freshness and Archived toggles (design + SPEC-2026-10-12-memory AC-24). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@devdigest/ui";
import { MEMORY_KINDS, MEMORY_SCOPES } from "../../constants";
import { s } from "../../styles";

export function FilterRail({
  scopes,
  kinds,
  counts,
  showStale,
  showArchived,
  onToggleScope,
  onToggleKind,
  onShowStale,
  onShowArchived,
}: {
  scopes: ReadonlySet<string>;
  kinds: ReadonlySet<string>;
  counts: { scope: Record<string, number>; kind: Record<string, number> } | undefined;
  showStale: boolean;
  showArchived: boolean;
  onToggleScope: (scope: string) => void;
  onToggleKind: (kind: string) => void;
  onShowStale: (v: boolean) => void;
  onShowArchived: (v: boolean) => void;
}) {
  const t = useTranslations("memory");
  return (
    <aside style={s.rail}>
      <div style={s.railGroup}>
        <div style={s.railLabel}>{t("page.filters.scope")}</div>
        {MEMORY_SCOPES.map((sc) => (
          <div key={sc} style={s.railRow}>
            <Checkbox checked={scopes.has(sc)} onChange={() => onToggleScope(sc)} label={t(`scope.${sc}`)} />
            <span style={s.railCount}>{counts?.scope[sc] ?? 0}</span>
          </div>
        ))}
      </div>
      <div style={s.railGroup}>
        <div style={s.railLabel}>{t("page.filters.kind")}</div>
        {MEMORY_KINDS.map((k) => (
          <div key={k} style={s.railRow}>
            <Checkbox checked={kinds.has(k)} onChange={() => onToggleKind(k)} label={t(`kind.${k}`)} />
            <span style={s.railCount}>{counts?.kind[k] ?? 0}</span>
          </div>
        ))}
      </div>
      <div style={s.railGroup}>
        <div style={s.railLabel}>{t("page.filters.freshness")}</div>
        <Checkbox checked={showStale} onChange={onShowStale} label={t("page.filters.showStale")} />
        <Checkbox checked={showArchived} onChange={onShowArchived} label={t("page.archived")} />
      </div>
    </aside>
  );
}
