/* PR list — /repos/:repoId/pulls. Ported from screen_dashboard.jsx; fetches
   GET /repos/:id/pulls (F1). Filters/sort live in query (?status&sort). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { AutoTriggerStatus } from "@/components/auto-trigger-status";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { LanguageBar } from "@/components/language-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePulls, useRefreshRepo } from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/contexts/repoContext";
import { ApiError } from "@/lib/api";
import { COLUMN_KEYS, GRID_COLS, SKELETON_ROWS } from "./constants";
import { compareByRisk } from "./helpers";
import { PRRow } from "./_components/PRRow";
import { FilterBar } from "./_components/FilterBar";
import { ReviewAllButton } from "./_components/ReviewAllButton";

/** Open PRs carry a derived review status; everything else is merged/closed. */
const OPEN_STATUSES = new Set(["needs_review", "reviewed", "stale"]);

export default function PullsPage() {
  const t = useTranslations("prReview");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: pulls, isLoading, isError, error, refetch } = usePulls(repoId);
  const refresh = useRefreshRepo();

  // Default to "needs review" — the most actionable filter on open.
  const status = search.get("status") ?? "needs_review";
  // SPEC-05 C-AC-3 — sort moved into the URL alongside status, so a Triage
  // queue view survives a reload and can be shared as a link.
  const sort = search.get("sort") ?? "newest";
  const triageOn = search.get("triage") === "1";

  // The filter/sort active immediately before Triage queue was turned on
  // (this session only) — restored on an explicit toggle-off (C-AC-4).
  // Cleared (not restored) by a manual filter/sort change while active,
  // since that manual choice stands as the new view instead (C-AC-32).
  const triagePrevRef = React.useRef<{ status: string; sort: string } | null>(null);

  const setParams = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) sp.delete(k);
      else sp.set(k, v); // always explicit so a value sticks over its default
    }
    router.replace(`/repos/${repoId}/pulls?${sp.toString()}`);
  };

  const setStatus = (k: string) => {
    if (triageOn && k !== status) {
      triagePrevRef.current = null;
      setParams({ status: k, triage: null });
      return;
    }
    setParams({ status: k });
  };

  const setSort = (k: string) => {
    if (triageOn && k !== sort) {
      triagePrevRef.current = null;
      setParams({ sort: k, triage: null });
      return;
    }
    setParams({ sort: k });
  };

  const activateTriage = () => {
    triagePrevRef.current = { status, sort };
    setParams({ status: "needs_review", sort: "highest_risk", triage: "1" });
  };

  const deactivateTriage = () => {
    const prev = triagePrevRef.current;
    triagePrevRef.current = null;
    if (prev) {
      setParams({ status: prev.status, sort: prev.sort, triage: null });
    } else {
      // C-AC-5 — loaded with triage URL state present, nothing in-session to
      // restore: fall back to the page defaults.
      setParams({ status: "needs_review", sort: "newest", triage: null });
    }
  };

  const toggleTriage = () => (triageOn ? deactivateTriage() : activateTriage());

  const [query, setQuery] = React.useState("");

  const q = query.trim().toLowerCase();
  const filtered = (pulls ?? [])
    .filter((p) => status === "all" || p.status === status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
    .slice()
    .sort((a, b) => {
      if (sort === "highest_risk") return compareByRisk(a, b);
      const ta = Date.parse(a.updated_at ?? "") || 0;
      const tb = Date.parse(b.updated_at ?? "") || 0;
      return sort === "oldest" ? ta - tb : tb - ta;
    });
  const repoName = activeRepo?.full_name ?? repoId;
  const openCount = (pulls ?? []).filter((p) => OPEN_STATUSES.has(p.status)).length;
  const needsReviewCount = (pulls ?? []).filter((p) => p.status === "needs_review").length;

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (repoNotFound) {
    return (
      <AppShell crumb={[{ label: repoName, mono: true }, { label: t("list.breadcrumb") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: repoName, mono: true }, { label: t("list.breadcrumb") }]}>
      <div className="flex items-end gap-4 px-8 pt-6 pb-2.5">
        <div>
          <h1 className="text-4xl font-bold tracking-[-0.02em]">{t("list.title")}</h1>
          <p className="mt-1 text-base text-muted-foreground">
            {pulls
              ? t("list.summary", { open: openCount, needsReview: needsReviewCount })
              : t("list.loading")}
          </p>
          {activeRepo?.languages && (
            <div className="mt-2.5 max-w-[420px]">
              <LanguageBar languages={activeRepo.languages} height={5} showLegend />
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <AutoTriggerStatus on={false} />
          <Button variant="ghost" data-active={triageOn} aria-pressed={triageOn} onClick={toggleTriage}>
            <Icon.Filter aria-hidden />
            {t("list.triageQueue")}
          </Button>
          <ReviewAllButton repoId={repoId} pulls={pulls} />
        </div>
      </div>

      <div className="mx-8 mt-3.5 mb-11 overflow-hidden rounded-xl border border-border bg-elevated">
        <FilterBar
          active={status}
          onActive={setStatus}
          query={query}
          onQuery={setQuery}
          sort={sort}
          onSort={setSort}
          onRefresh={() => refresh.mutate(repoId)}
          refreshing={refresh.isPending}
        />
        <div
          className={cn(
            "grid gap-3.5 border-b border-border bg-surface px-5 py-2.5 text-xs font-bold tracking-[0.06em] text-subtle-foreground uppercase",
            GRID_COLS,
          )}
        >
          {COLUMN_KEYS.map((key, i) => (
            <div key={key} className={i === COLUMN_KEYS.length - 1 ? "text-right" : "text-left"}>
              {t(`list.columns.${key}`)}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3.5 p-5">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title={t("list.errorTitle")}
            body={error instanceof ApiError ? error.message : t("list.errorBody")}
            onRetry={() => refetch()}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="GitPullRequest"
            title={t("list.emptyTitle")}
            body={
              status === "all"
                ? t("list.emptyAllBody")
                : t("list.emptyStatusBody", { status })
            }
          />
        ) : (
          filtered.map((pr) => (
            <PRRow
              key={pr.number}
              pr={pr}
              repoId={repoId}
              repoFullName={activeRepo?.full_name}
              showRiskTooltip={sort === "highest_risk"}
            />
          ))
        )}
      </div>
    </AppShell>
  );
}
