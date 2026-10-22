"use client";

import { useTranslations } from "next-intl";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { codeFieldTheme } from "./theme";
import { estimateTokens } from "./helpers";

/** Code editor field for markdown/prompt bodies (skill body, agent system
 *  prompt): file-tab header (name + unsaved state + token count) over a
 *  CodeMirror 6 editor with line numbers and markdown syntax highlighting.
 *  Used instead of a plain textarea wherever the body is itself a document. */
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
  const t = useTranslations("common.codeField");
  return (
    <div className="overflow-hidden rounded-[7px] border border-border-strong bg-elevated">
      {filename && (
        <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
          <Icon.FileText size={13} className="text-subtle-foreground" aria-hidden />
          <span className="mono text-ui text-muted-foreground">{filename}</span>
          {dirty && <Badge variant="warn">{t("unsaved")}</Badge>}
          <span className="tnum ml-auto text-[11.5px] text-subtle-foreground">
            {t("tokens", { count: estimateTokens(value) })}
          </span>
        </div>
      )}
      <CodeMirror
        value={value}
        onChange={(v) => onChange?.(v)}
        placeholder={placeholder}
        theme={codeFieldTheme}
        minHeight={`${minHeight}px`}
        extensions={[markdown(), EditorView.lineWrapping]}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
        className="text-sm"
      />
    </div>
  );
}
