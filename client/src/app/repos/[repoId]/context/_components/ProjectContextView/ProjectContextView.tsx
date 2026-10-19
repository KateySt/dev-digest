"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CodeField } from "@/components/code-field";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/contexts";
import { ApiError } from "@/lib/api";
import {
  useProjectContextDocument,
  useProjectContextDocuments,
  useRefreshProjectContext,
  useSaveProjectContextDocument,
} from "@/lib/hooks/project-context";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { AddFolderDialog } from "./_components/AddFolderDialog";
import { DocumentTree } from "./_components/DocumentTree";
import { blockedPathsFromError, footerTokenTotal, formatAge, parseBlockedPaths, uploadTargetPath } from "./helpers";

type Mode = "preview" | "edit";

/**
 * The repo-scoped Project Context page (C-AC-1..12). `page.tsx` stays thin
 * and delegates here per the module's structure convention.
 */
export function ProjectContextView() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data: list, isLoading, isError, refetch } = useProjectContextDocuments(repoId);
  const refresh = useRefreshProjectContext();
  const save = useSaveProjectContextDocument();

  // S-AC-28 / C-AC-9 — the resync action that can be refused because
  // project-context documents are locally modified. Reuses the dormant
  // repo-intel resync hooks (their own doc comment already names this page
  // as the intended caller) rather than inventing a parallel action.
  const [polling, setPolling] = React.useState(false);
  const { data: resyncState } = useRepoIntelStatus(repoId, polling);
  const resync = useResyncRepoIntel(repoId);
  // C-AC-29: paths from a synchronous 409 refusal; C-AC-30: persisted reason
  // (an in-job race) — the synchronous refusal wins while it is fresh.
  const [refusedPaths, setRefusedPaths] = React.useState<string[]>([]);
  const blockingPaths = refusedPaths.length > 0 ? refusedPaths : parseBlockedPaths(resyncState?.reason);

  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<Mode>("preview");
  const [editValue, setEditValue] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [addFolderOpen, setAddFolderOpen] = React.useState(false);
  const [addFolderError, setAddFolderError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: detail, isLoading: detailLoading } = useProjectContextDocument(repoId, selectedPath);

  // Empty while repos load — the breadcrumb shows a skeleton, never the raw id.
  const repoName = activeRepo?.full_name ?? "";

  if (repoNotFound) {
    return (
      <AppShell crumb={[{ label: repoName, mono: true }, { label: t("title") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const documents = list?.documents ?? [];
  const selectedListDoc = documents.find((d) => d.path === selectedPath) ?? null;

  const openDocument = (path: string) => {
    setSelectedPath(path);
    setMode("preview");
    setSaveError(null);
  };

  const startEdit = () => {
    setEditValue(detail?.content ?? "");
    setSaveError(null);
    setMode("edit");
  };

  const doSave = (path: string, content: string, onDone?: (savedPath: string) => void) => {
    save.mutate(
      { repoId, path, content },
      {
        onSuccess: (doc) => {
          setSaveError(null);
          onDone?.(doc.path);
        },
        onError: (err) => {
          setSaveError(err instanceof ApiError ? err.message : t("validation.generic"));
        },
      },
    );
  };

  const saveEdit = () => {
    if (!selectedPath) return;
    doSave(selectedPath, editValue, () => setMode("preview"));
  };

  const createFolder = (path: string, content: string) => {
    setAddFolderError(null);
    save.mutate(
      { repoId, path, content },
      {
        onSuccess: (doc) => {
          setAddFolderOpen(false);
          setSelectedPath(doc.path);
          setMode("preview");
        },
        onError: (err) => {
          setAddFolderError(err instanceof ApiError ? err.message : t("validation.generic"));
        },
      },
    );
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const path = uploadTargetPath(selectedPath, file.name);
      doSave(path, String(reader.result ?? ""), (savedPath) => {
        setSelectedPath(savedPath);
        setMode("preview");
      });
    };
    reader.readAsText(file);
  };

  const triggerResync = () => {
    setRefusedPaths([]);
    setPolling(true);
    resync.mutate(undefined, {
      onSuccess: () => setTimeout(() => setPolling(false), 4000),
      onError: (err) => {
        // A refused request enqueued nothing: render the refusal, stop polling.
        const paths = blockedPathsFromError(err);
        if (paths) setRefusedPaths(paths);
        setPolling(false);
      },
    });
  };

  const tokens = footerTokenTotal(documents);
  const age = formatAge(list?.last_refreshed_at);

  return (
    <AppShell crumb={[{ label: repoName, mono: true }, { label: t("title") }]}>
      {/* Two-column layout uses minmax(0, ...) tracks so a long unbroken path cannot
          widen the list column past the page edge (client/INSIGHTS.md 2026-09-24). */}
      <div className="box-border flex h-full min-h-0 flex-col px-8 py-6">
      <div className="mb-4.5 flex shrink-0 items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-base text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" disabled={refresh.isPending} onClick={() => refresh.mutate({ repoId })}>
            {refresh.isPending ? <Icon.Loader className="animate-spin" aria-hidden /> : <Icon.RefreshCw aria-hidden />}
            {refresh.isPending ? t("refreshing") : t("refresh")}
          </Button>
          <Button variant="secondary" disabled={resync.isPending || polling} onClick={triggerResync}>
            {resync.isPending || polling ? <Icon.Loader className="animate-spin" aria-hidden /> : <Icon.GitBranch aria-hidden />}
            {resync.isPending || polling ? t("resyncing") : t("resync")}
          </Button>
          <Button variant="secondary" disabled={save.isPending} onClick={() => fileInputRef.current?.click()}>
            {save.isPending ? <Icon.Loader className="animate-spin" aria-hidden /> : <Icon.Upload aria-hidden />}
            {save.isPending ? t("uploading") : t("upload")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md"
            onChange={onFileSelected}
            className="hidden"
          />
          <Button onClick={() => setAddFolderOpen(true)}>
            <Icon.Plus aria-hidden />
            {t("addFolder")}
          </Button>
        </div>
      </div>

      {saveError && mode !== "edit" && <div className="mt-2 text-sm text-crit">{saveError}</div>}

      {blockingPaths.length > 0 && (
        <div className="mb-4 rounded-lg border border-crit bg-crit-bg px-4 py-3">
          <div className="mb-1.5 text-sm font-bold text-crit">{t("refusal.title")}</div>
          <div className="mb-2 text-sm text-muted-foreground">{t("refusal.body")}</div>
          {blockingPaths.map((p) => (
            <div key={p} className="mono min-w-0 text-xs text-muted-foreground wrap-anywhere break-words">
              {p}
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
      {isError ? (
        <ErrorState title={t("loadError")} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,300px)_minmax(0,1fr)] items-stretch gap-5">
          <Skeleton className="h-100 w-full" />
          <Skeleton className="h-100 w-full" />
        </div>
      ) : list?.degraded ? (
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-elevated flex-1">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EmptyState icon="GitBranch" title={t("empty.noClone.title")} body={t("empty.noClone.body")} />
          </div>
        </div>
      ) : documents.length === 0 ? (
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-elevated flex-1">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EmptyState
              icon="FileText"
              title={t("empty.noDocuments.title")}
              body={t("empty.noDocuments.body")}
              cta={t("addFolder")}
              onCta={() => setAddFolderOpen(true)}
            />
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,300px)_minmax(0,1fr)] items-stretch gap-5">
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-elevated">
            <div className="shrink-0 border-b border-border px-3 pt-3.5 pb-2.5">
              <div className="text-2xs font-bold tracking-[0.08em] text-subtle-foreground uppercase">{t("listHeader.label")}</div>
              <div className="mono mt-1 text-xs text-muted-foreground">
                {t("listHeader.scope")}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              <DocumentTree documents={documents} selectedPath={selectedPath} onSelect={openDocument} />
            </div>
            <div className="flex shrink-0 flex-col gap-1 border-t border-border px-3 py-2.5 text-xs text-subtle-foreground">
              <span>{t("footer.documentCount", { count: documents.length })}</span>
              <span>{t("footer.tokenTotal", { tokens })}</span>
              <span>{age ? t("footer.lastRefreshed", { time: age }) : t("footer.neverRefreshed")}</span>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-elevated">
            {!selectedPath || !selectedListDoc ? (
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <EmptyState icon="FileText" title={t("selectPrompt.title")} body={t("selectPrompt.body")} />
              </div>
            ) : (
              <>
                <div className="flex min-w-0 shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <span className="mono min-w-0 text-base font-semibold wrap-anywhere break-words">{selectedPath}</span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {mode === "preview" ? (
                      <Button variant="secondary" size="sm" onClick={startEdit}>
                        <Icon.Edit aria-hidden />
                        {t("mode.edit")}
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setMode("preview")}>
                        {t("mode.preview")}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-3.5 border-b border-border px-4 py-2.5 text-xs text-subtle-foreground">
                  <span>
                    {t("usedBy", { count: selectedListDoc.used_by_agents ?? 0 })}
                  </span>
                  <span className="flex min-w-35 items-center gap-2">
                    {t("coverage.label")}:{" "}
                    {selectedListDoc.coverage_pct == null ? (
                      t("coverage.notApplicable")
                    ) : (
                      <>
                        <span className="mono tnum font-semibold text-foreground">
                          {Math.round(selectedListDoc.coverage_pct)}%
                        </span>
                        <Progress
                          value={selectedListDoc.coverage_pct}
                          aria-label={t("coverage.label")}
                          className="h-1.5 min-w-15 flex-1 bg-muted"
                        />
                      </>
                    )}
                  </span>
                  {selectedListDoc.locally_modified && (
                    <Badge variant="warn">
                      <Icon.AlertTriangle aria-hidden />
                      {t("locallyModified")}
                    </Badge>
                  )}
                </div>

                <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
                  {mode === "preview" ? (
                    detailLoading || detail === undefined ? (
                      <Skeleton className="h-50 w-full" />
                    ) : (
                      <Markdown>{detail.content ?? ""}</Markdown>
                    )
                  ) : (
                    <>
                      <CodeField value={editValue} onChange={setEditValue} filename={selectedPath} dirty />
                      {saveError && <div className="mt-2 text-sm text-crit">{saveError}</div>}
                      <div className="mt-3 flex gap-2.5">
                        <Button disabled={save.isPending} onClick={saveEdit}>
                          {save.isPending ? <Icon.Loader className="animate-spin" aria-hidden /> : <Icon.Check aria-hidden />}
                          {save.isPending ? t("editor.saving") : t("editor.save")}
                        </Button>
                        <Button variant="outline" onClick={() => setMode("preview")}>
                          {t("mode.preview")}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      </div>

      {addFolderOpen && (
        <AddFolderDialog
          onClose={() => {
            setAddFolderOpen(false);
            setAddFolderError(null);
          }}
          onCreate={createFolder}
          creating={save.isPending}
          error={addFolderError}
        />
      )}
      </div>
    </AppShell>
  );
}
