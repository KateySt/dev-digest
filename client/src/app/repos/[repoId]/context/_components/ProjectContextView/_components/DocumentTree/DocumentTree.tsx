"use client";

import React from "react";
import { Badge, Icon } from "@devdigest/ui";
import type { SpecFile } from "@/lib/types";
import { buildDocumentTree, foldersContaining, type TreeNode } from "./helpers";
import { s } from "./styles";

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
        <div key={node.path} style={s.fileRow(active, depth)} onClick={() => onSelect(doc.path)}>
          <Icon.FileText size={14} style={s.fileIcon} />
          <div style={s.filePathBox}>
            <span style={s.filePath}>{node.name}</span>
          </div>
          {doc.locally_modified && <Badge color="var(--warn)" icon="AlertTriangle" />}
        </div>
      );
    }

    const isOpen = expanded.has(node.path);
    return (
      <div key={node.path}>
        <div style={s.folderRow(depth)} onClick={() => toggle(node.path)}>
          {isOpen ? (
            <Icon.ChevronDown size={14} style={s.folderChevron} />
          ) : (
            <Icon.ChevronRight size={14} style={s.folderChevron} />
          )}
          <Icon.Folder size={14} style={s.folderIcon} />
          <span style={s.folderName}>{node.name}</span>
        </div>
        {isOpen && node.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return <>{tree.map((node) => renderNode(node, 0))}</>;
}
