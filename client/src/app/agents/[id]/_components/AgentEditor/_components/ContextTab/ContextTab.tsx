"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocumentRow } from "@/components/context-document-row";
import { useActiveRepo } from "@/lib/contexts/repoContext";
import {
  agentContextKey,
  useAgentContextDocuments,
  useProjectContextDocuments,
  useSetAgentContextDocuments,
} from "@/lib/hooks/project-context";
import { filterDocuments, initialOrder, reorder, tokenTotal } from "./helpers";
import { s } from "./styles";

/** Agent editor's Context tab (C-AC-13..20) — attach/detach/reorder the
 *  active repo's discovered documents. Mirrors SkillsTab.tsx's shape (drag
 *  handle/checkbox/filter/whole-set-replace) with `@/` imports and the
 *  shared `ContextDocumentRow`. Saves are optimistic-on-action, same idiom
 *  as SkillsTab — no separate Save button. */
export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();
  const { data: list, isLoading, isError, refetch } = useProjectContextDocuments(repoId, {
    agentId: agent.id,
  });
  const { data: attached } = useAgentContextDocuments(agent.id);
  const setDocuments = useSetAgentContextDocuments(agent.id);
  const qc = useQueryClient();

  const documents = React.useMemo(() => list?.documents ?? [], [list]);

  const [order, setOrder] = React.useState<string[] | null>(null);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOrder(null);
  }, [agent.id]);
  React.useEffect(() => {
    if (order === null && list && attached) {
      setOrder(initialOrder(documents.map((d) => d.path), attached));
    }
  }, [order, list, attached, documents]);

  const attachedPaths = React.useMemo(() => new Set((attached ?? []).map((a) => a.path)), [attached]);
  const byPath = React.useMemo(() => new Map(documents.map((d) => [d.path, d])), [documents]);

  /** Persist `nextOrder` ∩ `nextAttached`. Optimistic + serialized in the hook;
   *  on failure the cache is rolled back there, and the local order is reset
   *  so it re-derives from the restored server-confirmed set (C-AC-33). */
  const save = (nextOrder: string[], nextAttached: Set<string>) => {
    const paths = nextOrder.filter((p) => nextAttached.has(p));
    setDocuments.replace(paths, { onError: () => setOrder(null) });
  };

  /** The latest attached set straight from the cache (C-AC-32): the render
   *  closure can lag a just-applied optimistic update, which is what used to
   *  drop the first of two quick toggles. */
  const latestAttached = () =>
    new Set(
      (qc.getQueryData<{ path: string }[]>(agentContextKey(agent.id)) ?? attached ?? []).map((a) => a.path),
    );

  const toggle = (path: string, checked: boolean) => {
    if (!order) return;
    const next = latestAttached();
    if (checked) next.add(path);
    else next.delete(path);
    save(order, next);
  };

  const onDrop = (targetPath: string) => {
    setOverId(null);
    if (!order || !dragId || dragId === targetPath) {
      setDragId(null);
      return;
    }
    const nextOrder = reorder(order, dragId, targetPath);
    setOrder(nextOrder);
    setDragId(null);
    save(nextOrder, latestAttached());
  };

  const move = (path: string, dir: -1 | 1) => {
    if (!order) return;
    const idx = order.indexOf(path);
    const targetIdx = idx + dir;
    if (idx < 0 || targetIdx < 0 || targetIdx >= order.length) return;
    const next = order.slice();
    const tmp = next[idx]!;
    next[idx] = next[targetIdx]!;
    next[targetIdx] = tmp;
    setOrder(next);
    save(next, latestAttached());
  };

  if (isError) {
    return <ErrorState title={t("context.loadError")} onRetry={() => refetch()} />;
  }

  if (isLoading || order === null) {
    return (
      <div style={s.wrap}>
        <Skeleton height={40} />
        <Skeleton height={200} />
      </div>
    );
  }

  const filterActive = filter.trim().length > 0;
  const visiblePaths = new Set(filterDocuments(documents, filter).map((d) => d.path));
  const rows = order.filter((p) => visiblePaths.has(p) && byPath.has(p));

  const attachedDocs = documents.filter((d) => attachedPaths.has(d.path));
  const { tokens, estimated } = tokenTotal(attachedDocs);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <Badge color="var(--accent)">
          {t("context.attachedBadge", { linked: attachedPaths.size, total: documents.length })}
        </Badge>
      </div>

      <div style={s.filter}>
        <Icon.Search size={13} style={s.filterIcon} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("context.filterPlaceholder")}
          style={s.filterInput}
        />
      </div>

      {documents.length === 0 ? (
        <div style={s.empty}>{t("context.empty")}</div>
      ) : rows.length === 0 ? (
        <div style={s.empty}>{t("context.noMatch")}</div>
      ) : (
        <div style={s.list}>
          {rows.map((path, i) => {
            const doc = byPath.get(path)!;
            return (
              <ContextDocumentRow
                key={path}
                repoId={repoId ?? ""}
                doc={doc}
                checked={attachedPaths.has(path)}
                onToggle={(checked) => toggle(path, checked)}
                draggable={!filterActive}
                dragging={dragId === path}
                dragOver={overId === path && dragId !== path}
                onDragStart={() => setDragId(path)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overId !== path) setOverId(path);
                }}
                onDrop={() => onDrop(path)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onMoveUp={!filterActive && i > 0 ? () => move(path, -1) : undefined}
                onMoveDown={!filterActive && i < rows.length - 1 ? () => move(path, 1) : undefined}
                labels={{
                  preview: t("context.preview"),
                  moveUp: t("context.moveUp"),
                  moveDown: t("context.moveDown"),
                  dragHandleLabel: (p) => t("context.dragHandleLabel", { name: p }),
                  dragHandleInertLabel: t("context.dragHandleInertLabel"),
                }}
              />
            );
          })}
        </div>
      )}

      <div style={s.footerRow}>
        <span style={s.footerTokens}>
          {t(estimated ? "context.tokenTotalEstimated" : "context.tokenTotal", { tokens })}
        </span>
        {estimated && (
          <Badge color="var(--info)" icon="Info">
            {t("context.estimatedBadge")}
          </Badge>
        )}
      </div>
      <p style={s.footerNote}>{t("context.footerNote")}</p>
    </div>
  );
}
