"use client";

import React from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import type { SpecFile } from "@/lib/types";
import { buildDocumentTree, foldersContaining, type TreeNode } from "./helpers";

/** Tree depth, passed to CSS as `--depth` for GitHub-sidebar-style indentation
 *  (12px base + 16px per level; files get one extra level for the chevron). */
const depthStyle = (depth: number) => ({ "--depth": depth }) as React.CSSProperties;

/** GitHub-sidebar-style collapsible folder tree for the Project Context
 *  document list — groups the flat repo-relative path list by folder so a
 *  shared prefix (`docs/agent-prompts/skills/…`) renders once as nesting
 *  instead of being repeated on every row. */
export function DocumentTree({
  documents,
  selectedPath,
  onSelect,
}: {
  documents: SpecFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const tree = React.useMemo(() => buildDocumentTree(documents), [documents]);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    if (!selectedPath) return;
    const toSelected = foldersContaining(tree, (n) => n.isFile && n.doc?.path === selectedPath);
    if (toSelected.size === 0) return;
    setExpanded((prev) => new Set([...prev, ...toSelected]));
  }, [selectedPath, tree]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (node.isFile) {
      const doc = node.doc!;
      const active = doc.path === selectedPath;
      return (
        <div
          key={node.path}
          onClick={() => onSelect(doc.path)}
          aria-current={active ? "true" : undefined}
          className={cn(
            "flex min-w-0 cursor-pointer items-center gap-2 py-1.75 pr-3 pl-[calc(28px+var(--depth)*16px)]",
            active ? "bg-brand-bg" : "hover:bg-accent",
          )}
          style={depthStyle(depth)}
        >
          <Icon.FileText size={14} className="shrink-0 text-subtle-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <span className="mono min-w-0 text-sm text-foreground wrap-anywhere break-words">{node.name}</span>
          </div>
          {doc.locally_modified && (
            <span className="inline-flex rounded-sm bg-warn-bg p-0.75 text-warn">
              <Icon.AlertTriangle size={12} aria-hidden />
            </span>
          )}
        </div>
      );
    }

    const isOpen = expanded.has(node.path);
    const Chevron = isOpen ? Icon.ChevronDown : Icon.ChevronRight;
    return (
      <div key={node.path}>
        <div
          onClick={() => toggle(node.path)}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 py-1.75 pr-3 pl-[calc(12px+var(--depth)*16px)] text-muted-foreground hover:bg-accent"
          style={depthStyle(depth)}
        >
          <Chevron size={14} className="shrink-0 text-subtle-foreground" aria-hidden />
          <Icon.Folder size={14} className="shrink-0 text-subtle-foreground" aria-hidden />
          <span className="truncate text-sm font-semibold">{node.name}</span>
        </div>
        {isOpen && node.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return <>{tree.map((node) => renderNode(node, 0))}</>;
}
