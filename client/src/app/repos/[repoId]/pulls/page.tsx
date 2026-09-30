/* PR list — /repos/:repoId/pulls. Ported from screen_dashboard.jsx; fetches
   GET /repos/:id/pulls (F1). Filters/sort live in query (?status&sort). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Skeleton,
  EmptyState,
  ErrorState,
  AutoTriggerStatus,
  Button,
} from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePulls, useRefreshRepo } from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { COLUMN_KEYS, SKELETON_ROWS } from "./constants";
import { s } from "./styles";
import { compareByRisk } from "./helpers";
import { PRRow } from "./_components/PRRow";
import { FilterBar } from "./_components/FilterBar";

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
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>{t("list.title")}</h1>
          <p style={s.pageSubtitle}>
            {pulls
              ? t("list.summary", { open: openCount, needsReview: needsReviewCount })
              : t("list.loading")}
          </p>
        </div>
        <div style={s.headerActions}>
          <AutoTriggerStatus on={false} />
          <Button
            kind="tertiary"
            icon="Filter"
            active={triageOn}
            aria-pressed={triageOn}
            onClick={toggleTriage}
          >
            {t("list.triageQueue")}
          </Button>
        </div>
      </div>

      <div style={s.tableCard}>
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
        <div style={s.headRow}>
          {COLUMN_KEYS.map((key, i) => (
            <div key={key} style={s.headCell(i === COLUMN_KEYS.length - 1)}>
              {t(`list.columns.${key}`)}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <Skeleton key={i} height={28} />
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
