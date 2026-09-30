import type { CSSProperties } from "react";

/** Co-located styles for DocumentTree — depth-based indentation mirrors a
 *  GitHub-style file browser sidebar. */
export const s = {
  folderRow: (depth: number): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    paddingLeft: 12 + depth * 16,
    cursor: "pointer",
    minWidth: 0,
    color: "var(--text-secondary)",
  }),
  folderChevron: { flexShrink: 0, color: "var(--text-muted)" } satisfies CSSProperties,
  folderIcon: { flexShrink: 0, color: "var(--text-muted)" } satisfies CSSProperties,
  folderName: {
    fontSize: 13,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  fileRow: (active: boolean, depth: number): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    paddingLeft: 12 + 16 + depth * 16,
    borderBottom: "none",
    background: active ? "var(--accent-bg)" : "transparent",
    cursor: "pointer",
    minWidth: 0,
  }),
  fileIcon: { flexShrink: 0, color: "var(--text-muted)" } satisfies CSSProperties,
  filePathBox: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  filePath: {
    fontSize: 13,
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-primary)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
  } satisfies CSSProperties,
} as const;
