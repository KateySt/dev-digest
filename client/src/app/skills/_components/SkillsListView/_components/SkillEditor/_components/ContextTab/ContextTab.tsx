"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ContextDocumentRow } from "@/components/context-document-row";
import { useActiveRepo } from "@/lib/contexts";
import {
  useProjectContextDocuments,
  skillContextKey,
  useSetSkillContextDocuments,
  useSkillContextDocuments,
} from "@/lib/hooks/project-context";
import { filterDocuments, initialOrder, reorder, serializedBlock } from "./helpers";
import { s } from "./styles";

/** Skill editor's Context tab (C-AC-21, C-AC-22) — same row layout as the
 *  Agent editor's Context tab (shared `ContextDocumentRow`), a "N attached"
 *  badge, the inheritance note, and the "SERIALIZES AS" box. */
export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();
  const { data: list, isLoading, isError, refetch } = useProjectContextDocuments(repoId, {
    skillId: skill.id,
  });
  const { data: attached } = useSkillContextDocuments(skill.id);
  const setDocuments = useSetSkillContextDocuments(skill.id);
  const qc = useQueryClient();

  const documents = React.useMemo(() => list?.documents ?? [], [list]);

  const [order, setOrder] = React.useState<string[] | null>(null);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOrder(null);
  }, [skill.id]);
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
      (qc.getQueryData<{ path: string }[]>(skillContextKey(skill.id)) ?? attached ?? []).map((a) => a.path),
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
  const attachedOrder = order.filter((p) => attachedPaths.has(p));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <Badge color="var(--accent)">{t("context.attachedBadge", { count: attachedPaths.size })}</Badge>
      </div>
      <p style={s.hint}>{t("context.inheritNote")}</p>

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

      <div style={s.serializeLabel}>{t("context.serializesAs")}</div>
      <pre className="mono" style={s.serializeBox}>
        {serializedBlock(attachedOrder) || "—"}
      </pre>
    </div>
  );
}
