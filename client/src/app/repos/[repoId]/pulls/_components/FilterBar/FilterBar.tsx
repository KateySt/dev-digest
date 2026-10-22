/* FilterBar — search box, status chips, sort select, and refresh for the PR list. */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { FilterChip } from "@/components/filter-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_FILTERS } from "../../constants";

export function FilterBar({
  active,
  onActive,
  query,
  onQuery,
  sort,
  onSort,
  onRefresh,
  refreshing,
}: {
  active: string;
  onActive: (k: string) => void;
  query: string;
  onQuery: (v: string) => void;
  sort: string;
  onSort: (v: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const t = useTranslations("prReview");
  const sortOptions = [
    { value: "newest", label: t("list.sort.newest") },
    { value: "oldest", label: t("list.sort.oldest") },
    { value: "highest_risk", label: t("list.sort.highestRisk") },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
      <div className="flex gap-2">
        <Input
          className="w-60"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("list.filterPlaceholder")}
          aria-label={t("list.filterPlaceholder")}
        />
        {STATUS_FILTERS.map(({ key, labelKey }) => (
          <FilterChip key={key} active={active === key} onClick={() => onActive(key)}>
            {t(`list.filter.${labelKey}`)}
          </FilterChip>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <Select value={sort} onValueChange={onSort}>
          <SelectTrigger aria-label={t("list.sort.label")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {sortOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
          <Icon.RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden />
          {refreshing ? t("list.refreshing") : t("list.refresh")}
        </Button>
      </div>
    </div>
  );
}
