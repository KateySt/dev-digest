"use client";

import React from "react";
import { Icon } from "@/components/icon";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectContextDocument } from "@/lib/hooks/project-context";
import type { SpecFile } from "@/lib/types";
import { cn } from "@/lib/utils";

const SOURCE_FOLDER_TONE: Record<string, "brand" | "ok" | "warn"> = {
  specs: "brand",
  docs: "ok",
  insights: "warn",
};

const REORDER_BTN =
  "inline-flex cursor-pointer items-center justify-center border-none bg-transparent p-px text-subtle-foreground";
/* Path text and tags get their own wrap room (client/INSIGHTS.md 2026-09-24) —
   wrap/min-w-0 on the text's own box, never relying on the row's flex alone. */
const TAG = "min-w-0 shrink-0 wrap-anywhere";

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
    <div className="flex flex-col">
      <div
        draggable={draggable}
        onDragStart={draggable ? onDragStart : undefined}
        onDragOver={draggable ? onDragOver : undefined}
        onDrop={draggable ? onDrop : undefined}
        onDragEnd={draggable ? onDragEnd : undefined}
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-lg border bg-surface px-2.5 py-2.25",
          dragOver ? "border-primary" : "border-border",
          dragging && "opacity-50",
        )}
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
          className={cn(
            "inline-flex shrink-0 text-subtle-foreground",
            draggable ? "cursor-grab" : "cursor-not-allowed opacity-35",
          )}
        >
          <Icon.Menu size={14} aria-hidden />
        </span>
        {(onMoveUp || onMoveDown) && (
          <span className="inline-flex shrink-0 flex-col gap-px">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!onMoveUp}
              aria-label={labels.moveUp}
              className={cn(REORDER_BTN, !onMoveUp && "invisible")}
            >
              <Icon.ArrowUp size={12} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!onMoveDown}
              aria-label={labels.moveDown}
              className={cn(REORDER_BTN, !onMoveDown && "invisible")}
            >
              <Icon.ArrowDown size={12} aria-hidden />
            </button>
          </span>
        )}
        <Checkbox checked={checked} onCheckedChange={(v) => onToggle(v === true)} aria-label={doc.path} />
        <div className="min-w-0 flex-1">
          <span className="mono min-w-0 text-sm font-medium break-words wrap-anywhere">{doc.path}</span>
        </div>
        {doc.source_folder && (
          <Badge variant={SOURCE_FOLDER_TONE[doc.source_folder] ?? "neutral"} className={TAG}>
            {doc.source_folder}
          </Badge>
        )}
        {doc.locally_modified && (
          <Badge variant="warn" className={TAG}>
            <Icon.AlertTriangle aria-hidden />
          </Badge>
        )}
        <button
          type="button"
          onClick={() => setPreviewOpen((o) => !o)}
          aria-expanded={previewOpen}
          className="shrink-0 cursor-pointer rounded-md border border-border bg-transparent px-2.25 py-1 text-xs font-semibold text-brand-text"
        >
          {labels.preview}
        </button>
      </div>
      {previewOpen && (
        <div className="mt-1 max-h-65 overflow-auto rounded-lg border border-border bg-code-bg px-3.5 py-2.5 text-sm">
          {isLoading || data === undefined ? <Skeleton className="h-15 w-full" /> : <Markdown>{data.content ?? ""}</Markdown>}
        </div>
      )}
    </div>
  );
}
