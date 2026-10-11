"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Badge, Button, CodeField, EmptyState, ErrorState, Markdown, ProgressBar, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
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
import { s } from "./styles";

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

  const repoName = activeRepo?.full_name ?? repoId;

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
      <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>{t("title")}</h1>
          <p style={s.pageSubtitle}>{t("subtitle")}</p>
        </div>
        <div style={s.headerActions}>
          <Button kind="secondary" icon="RefreshCw" loading={refresh.isPending} onClick={() => refresh.mutate({ repoId })}>
            {refresh.isPending ? t("refreshing") : t("refresh")}
          </Button>
          <Button kind="secondary" icon="GitBranch" loading={resync.isPending || polling} onClick={triggerResync}>
            {resync.isPending || polling ? t("resyncing") : t("resync")}
          </Button>
          <Button
            kind="secondary"
            icon="Upload"
            loading={save.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {save.isPending ? t("uploading") : t("upload")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md"
            onChange={onFileSelected}
            style={{ display: "none" }}
          />
          <Button kind="primary" icon="Plus" onClick={() => setAddFolderOpen(true)}>
            {t("addFolder")}
          </Button>
        </div>
      </div>

      {saveError && mode !== "edit" && <div style={s.saveError}>{saveError}</div>}

      {blockingPaths.length > 0 && (
        <div style={s.refusal}>
          <div style={s.refusalTitle}>{t("refusal.title")}</div>
          <div style={s.refusalBody}>{t("refusal.body")}</div>
          {blockingPaths.map((p) => (
            <div key={p} className="mono" style={s.refusalPath}>
              {p}
            </div>
          ))}
        </div>
      )}

      <div style={s.content}>
      {isError ? (
        <ErrorState title={t("loadError")} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div style={s.grid}>
          <Skeleton height={400} />
          <Skeleton height={400} />
        </div>
      ) : list?.degraded ? (
        <div style={{ ...s.panel, flex: 1, minHeight: 0 }}>
          <div style={s.panelFill}>
            <EmptyState icon="GitBranch" title={t("empty.noClone.title")} body={t("empty.noClone.body")} />
          </div>
        </div>
      ) : documents.length === 0 ? (
        <div style={{ ...s.panel, flex: 1, minHeight: 0 }}>
          <div style={s.panelFill}>
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
        <div style={s.grid}>
          <div style={s.panel}>
            <div style={s.listHeader}>
              <div style={s.listHeaderLabel}>{t("listHeader.label")}</div>
              <div style={s.listHeaderPath} className="mono">
                {t("listHeader.scope")}
              </div>
            </div>
            <div style={s.list}>
              <DocumentTree documents={documents} selectedPath={selectedPath} onSelect={openDocument} />
            </div>
            <div style={s.footer}>
              <span>{t("footer.documentCount", { count: documents.length })}</span>
              <span>{t("footer.tokenTotal", { tokens })}</span>
              <span>{age ? t("footer.lastRefreshed", { time: age }) : t("footer.neverRefreshed")}</span>
            </div>
          </div>

          <div style={s.panel}>
            {!selectedPath || !selectedListDoc ? (
              <div style={s.panelFill}>
                <EmptyState icon="FileText" title={t("selectPrompt.title")} body={t("selectPrompt.body")} />
              </div>
            ) : (
              <>
                <div style={s.detailHeader}>
                  <div style={s.detailPathBox}>
                    <span style={s.detailPath}>{selectedPath}</span>
                  </div>
                  <div style={s.detailActions}>
                    {mode === "preview" ? (
                      <Button kind="secondary" size="sm" icon="Edit" onClick={startEdit}>
                        {t("mode.edit")}
                      </Button>
                    ) : (
                      <Button kind="ghost" size="sm" onClick={() => setMode("preview")}>
                        {t("mode.preview")}
                      </Button>
                    )}
                  </div>
                </div>

                <div style={s.detailMeta}>
                  <span>
                    {t("usedBy", { count: selectedListDoc.used_by_agents ?? 0 })}
                  </span>
                  <span style={s.coverageRow}>
                    {t("coverage.label")}:{" "}
                    {selectedListDoc.coverage_pct == null ? (
                      t("coverage.notApplicable")
                    ) : (
                      <>
                        <span className="mono tnum" style={s.coveragePct}>
                          {Math.round(selectedListDoc.coverage_pct)}%
                        </span>
                        <span style={s.coverageBar}>
                          <ProgressBar value={selectedListDoc.coverage_pct} />
                        </span>
                      </>
                    )}
                  </span>
                  {selectedListDoc.locally_modified && (
                    <Badge color="var(--warn)" icon="AlertTriangle">
                      {t("locallyModified")}
                    </Badge>
                  )}
                </div>

                <div style={s.detailBody}>
                  {mode === "preview" ? (
                    detailLoading || detail === undefined ? (
                      <Skeleton height={200} />
                    ) : (
                      <Markdown>{detail.content ?? ""}</Markdown>
                    )
                  ) : (
                    <>
                      <CodeField value={editValue} onChange={setEditValue} filename={selectedPath} dirty />
                      {saveError && <div style={s.saveError}>{saveError}</div>}
                      <div style={s.editActions}>
                        <Button kind="primary" icon="Check" loading={save.isPending} onClick={saveEdit}>
                          {save.isPending ? t("editor.saving") : t("editor.save")}
                        </Button>
                        <Button kind="ghost" onClick={() => setMode("preview")}>
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
