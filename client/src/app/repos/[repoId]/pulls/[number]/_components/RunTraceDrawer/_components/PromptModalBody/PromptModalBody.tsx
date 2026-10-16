/* PromptModalBody — fullscreen modal body for a prompt block: monospace text +
   a line search. Fixed height so the modal stays stable even when the search
   finds nothing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";

/** Highlight every case-insensitive occurrence of `q` within a single line. */
function highlightLine(line: string, q: string): React.ReactNode {
  if (!q) return line;
  const lower = line.toLowerCase();
  const ql = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i <= line.length) {
    const idx = lower.indexOf(ql, i);
    if (idx === -1) {
      parts.push(line.slice(i));
      break;
    }
    if (idx > i) parts.push(line.slice(i, idx));
    parts.push(
      <mark key={idx} className="rounded-[2px] bg-primary text-background">
        {line.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return parts;
}

export function PromptModalBody({ text }: { text: string }) {
  const t = useTranslations("runs");
  const [q, setQ] = React.useState("");
  const lines = React.useMemo(() => (text || "—").split("\n"), [text]);
  const ql = q.trim().toLowerCase();
  const shown = ql ? lines.filter((l) => l.toLowerCase().includes(ql)) : lines;
  return (
    <div className="flex h-[70vh] flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-6 py-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("trace.prompt.search")}
          aria-label={t("trace.prompt.search")}
        />
        {ql && (
          <span className="text-xs whitespace-nowrap text-subtle-foreground">
            {shown.length} / {lines.length}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {ql && shown.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-subtle-foreground">
            {t("trace.prompt.noMatches", { q: q.trim() })}
          </div>
        ) : (
          <pre className="mono m-0 px-6 py-4 text-ui leading-[1.6] whitespace-pre-wrap">
            {ql ? shown.map((l, i) => <div key={i}>{highlightLine(l, q)}</div>) : text || "—"}
          </pre>
        )}
      </div>
    </div>
  );
}
