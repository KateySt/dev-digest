"use client";

import React from "react";
import { Badge, Checkbox, Icon, Markdown, Skeleton } from "@devdigest/ui";
import { useProjectContextDocument } from "@/lib/hooks/project-context";
import type { SpecFile } from "@/lib/types";
import { s } from "./styles";

const SOURCE_FOLDER_COLOR: Record<string, string> = {
  specs: "var(--accent)",
  docs: "var(--ok)",
  insights: "var(--warn)",
};

export interface ContextDocumentRowLabels {
  preview: string;
  moveUp: string;
  moveDown: string;
  /** aria-label for the drag handle, filled with the document's path. */
  dragHandleLabel: (path: string) => string;
  /** Reason the handle is inert (shown while a filter is active — C-AC-18). */
  dragHandleInertLabel: string;
}

/**
 * One document row shared by the Agent editor's and Skill editor's Context
 * tabs (C-AC-13, C-AC-21) — promoted here (a real second consumer on day
 * one) rather than duplicated, following the `SeverityCountBadges` precedent
 * (`client/src/components/findings-tooltip`).
 *
 * Drag handle + a keyboard-reachable move-up/move-down pair both reorder —
 * dragging alone has no keyboard equivalent (accessibility NFR). While
 * `draggable` is false (a filter is active, C-AC-18) the handle is dimmed
 * AND marked inert to assistive tech (`aria-disabled` + a title explaining
 * why), not dimmed alone.
 */
export function ContextDocumentRow({
  repoId,
  doc,
  checked,
  onToggle,
  draggable,
  dragging,
  dragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onMoveUp,
  onMoveDown,
  labels,
}: {
  repoId: string;
  doc: SpecFile;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  draggable: boolean;
  dragging: boolean;
  dragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  labels: ContextDocumentRowLabels;
}) {
  const [previewOpen, setPreviewOpen] = React.useState(false);
  // Lazy fetch: only enabled once the row's Preview is opened. `data` stays
  // `undefined` (react-query's own "not fetched yet" signal) until then —
  // never collapsed via `?? ""` before the loading check (client/INSIGHTS.md
  // 2026-09-15's hover-trigger deadlock was exactly this class of bug).
  const { data, isLoading } = useProjectContextDocument(repoId, previewOpen ? doc.path : null);

  return (
    <div style={s.wrap}>
      <div
        draggable={draggable}
        onDragStart={draggable ? onDragStart : undefined}
        onDragOver={draggable ? onDragOver : undefined}
        onDrop={draggable ? onDrop : undefined}
        onDragEnd={draggable ? onDragEnd : undefined}
        style={s.row(dragging, dragOver)}
      >
        {/* A real (if inert) widget, not a decorative icon: `aria-disabled`
            (never `aria-hidden`, which would remove it from the
            accessibility tree entirely and defeat the point) plus an
            `aria-label` so the inert reason is actually announced, not just
            visually dimmed (C-AC-18's accessibility NFR). */}
        <span
          role="button"
          tabIndex={-1}
          aria-disabled={!draggable}
          aria-label={draggable ? labels.dragHandleLabel(doc.path) : labels.dragHandleInertLabel}
          title={draggable ? labels.dragHandleLabel(doc.path) : labels.dragHandleInertLabel}
          style={s.handle(draggable)}
        >
          <Icon.Menu size={14} />
        </span>
        {(onMoveUp || onMoveDown) && (
          <span style={s.reorderButtons}>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!onMoveUp}
              aria-label={labels.moveUp}
              style={{ ...s.iconBtn, visibility: onMoveUp ? "visible" : "hidden" }}
            >
              <Icon.ArrowUp size={12} />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!onMoveDown}
              aria-label={labels.moveDown}
              style={{ ...s.iconBtn, visibility: onMoveDown ? "visible" : "hidden" }}
            >
              <Icon.ArrowDown size={12} />
            </button>
          </span>
        )}
        <Checkbox checked={checked} onChange={onToggle} />
        <div style={s.pathBox}>
          <span style={s.path}>{doc.path}</span>
        </div>
        {doc.source_folder && (
          <Badge color={SOURCE_FOLDER_COLOR[doc.source_folder] ?? "var(--text-secondary)"} style={s.tagBadge}>
            {doc.source_folder}
          </Badge>
        )}
        {doc.locally_modified && <Badge color="var(--warn)" icon="AlertTriangle" style={s.tagBadge} />}
        <button
          type="button"
          onClick={() => setPreviewOpen((o) => !o)}
          aria-expanded={previewOpen}
          style={s.previewBtn}
        >
          {labels.preview}
        </button>
      </div>
      {previewOpen && (
        <div style={s.previewPane}>
          {isLoading || data === undefined ? <Skeleton height={60} /> : <Markdown>{data.content ?? ""}</Markdown>}
        </div>
      )}
    </div>
  );
}
