import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";

/** CodeMirror takes colours through its theme API, not classes. Values are
 *  `var(--…)` references to the globals.css theme variables (not resolved
 *  colours), so the editor follows mode/palette/accent switches live. */
export const codeFieldTheme = createTheme({
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
