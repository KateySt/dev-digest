import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { createTheme } from "@uiw/codemirror-themes";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { Icon } from "../icons";
import { Badge } from "../primitives/Badge";

/** Matches the CSS variables in styles.css so the editor tracks light/dark
 *  automatically — values are `var(--…)` references, not resolved colors. */
const theme = createTheme({
  theme: "dark",
  settings: {
    background: "transparent",
    foreground: "var(--text-primary)",
    caret: "var(--accent)",
    selection: "var(--accent-bg)",
    selectionMatch: "var(--accent-bg)",
    lineHighlight: "transparent",
    gutterBackground: "transparent",
    gutterForeground: "var(--text-muted)",
    gutterBorder: "transparent",
    fontFamily: "var(--font-mono)",
  },
  styles: [
    { tag: t.heading, color: "var(--accent-text)", fontWeight: "bold" },
    { tag: t.strong, color: "var(--text-primary)", fontWeight: "bold" },
    { tag: t.emphasis, color: "var(--text-secondary)", fontStyle: "italic" },
    { tag: t.link, color: "var(--accent)" },
    { tag: t.url, color: "var(--accent)" },
    { tag: t.monospace, color: "var(--code-add-text)" },
    { tag: t.processingInstruction, color: "var(--text-muted)" },
    { tag: t.comment, color: "var(--text-muted)" },
    { tag: t.meta, color: "var(--text-muted)" },
  ],
});

/** Rough token estimate (≈4 chars/token, the common English-text heuristic) —
 *  good enough for an at-a-glance size hint, not a billing figure. */
function estimateTokens(text: string): number {
  return text.trim() ? Math.ceil(text.trim().length / 4) : 0;
}

/** Code editor field for markdown/prompt bodies (skill body, agent system
 *  prompt): file-tab header (name + unsaved state + token count) over a
 *  CodeMirror 6 editor with line numbers and markdown syntax highlighting.
 *  Swaps in for the plain `Textarea` wherever the body is itself a document,
 *  not just free text. */
export function CodeField({
  value,
  onChange,
  filename,
  dirty,
  minHeight = 280,
  placeholder,
}: {
  value: string;
  onChange?: (v: string) => void;
  filename?: string;
  dirty?: boolean;
  minHeight?: number;
  placeholder?: string;
}) {
  return (
    <div
      style={{
        borderRadius: 7,
        border: "1px solid var(--border-strong)",
        background: "var(--bg-elevated)",
        overflow: "hidden",
      }}
    >
      {filename && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-surface)",
          }}
        >
          <Icon.FileText size={13} style={{ color: "var(--text-muted)" }} />
          <span className="mono" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            {filename}
          </span>
          {dirty && (
            <Badge color="var(--warn)" bg="var(--warn-bg)">
              unsaved
            </Badge>
          )}
          <span
            className="tnum"
            style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)" }}
          >
            {estimateTokens(value)} tokens
          </span>
        </div>
      )}
      <CodeMirror
        value={value}
        onChange={(v) => onChange?.(v)}
        placeholder={placeholder}
        theme={theme}
        minHeight={`${minHeight}px`}
        extensions={[markdown(), EditorView.lineWrapping]}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
        style={{ fontSize: 13 }}
      />
    </div>
  );
}
