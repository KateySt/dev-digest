/* Left rail of the Memory page: Scope / Kind checkboxes with facet counts,
   Freshness and Archived toggles (design + SPEC-2026-10-12-memory AC-24). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { MEMORY_CLASSES, MEMORY_KINDS, MEMORY_SCOPES } from "../../constants";

const GROUP = "flex flex-col gap-2.5";
const ROW = "flex items-center justify-between gap-2";
const COUNT = "text-xs text-subtle-foreground";

/** Checkbox with its label as the accessible name (the label wraps both). */
function RailCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-base text-muted-foreground">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  );
}

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
    <aside className="flex flex-col gap-5.5 overflow-y-auto border-r border-border px-4.5 py-5">
      <div className={GROUP}>
        <div className={MEMORY_CLASSES.sectionLabel}>{t("page.filters.scope")}</div>
        {MEMORY_SCOPES.map((sc) => (
          <div key={sc} className={ROW}>
            <RailCheckbox checked={scopes.has(sc)} onChange={() => onToggleScope(sc)} label={t(`scope.${sc}`)} />
            <span className={COUNT}>{counts?.scope[sc] ?? 0}</span>
          </div>
        ))}
      </div>
      <div className={GROUP}>
        <div className={MEMORY_CLASSES.sectionLabel}>{t("page.filters.kind")}</div>
        {MEMORY_KINDS.map((k) => (
          <div key={k} className={ROW}>
            <RailCheckbox checked={kinds.has(k)} onChange={() => onToggleKind(k)} label={t(`kind.${k}`)} />
            <span className={COUNT}>{counts?.kind[k] ?? 0}</span>
          </div>
        ))}
      </div>
      <div className={GROUP}>
        <div className={MEMORY_CLASSES.sectionLabel}>{t("page.filters.freshness")}</div>
        <RailCheckbox checked={showStale} onChange={onShowStale} label={t("page.filters.showStale")} />
        <RailCheckbox checked={showArchived} onChange={onShowArchived} label={t("page.archived")} />
      </div>
    </aside>
  );
}
