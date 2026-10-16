/* ToolCallRow — one expandable tool-call line in the Tool calls section. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import type { ToolCall } from "@devdigest/shared";

export function ToolCallRow({ tc }: { tc: ToolCall }) {
  const t = useTranslations("runs");
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mb-2 overflow-hidden rounded-md border border-border">
      <div onClick={() => setOpen((o) => !o)} className="flex cursor-pointer items-center gap-2.5 bg-surface px-3 py-2.5">
        <Icon.Wrench size={13} className="text-warn" aria-hidden />
        <span className="mono text-sm">
          {tc.tool}
          <span className="text-subtle-foreground">({tc.args})</span>
        </span>
        <span className="ml-auto text-xs text-subtle-foreground">{tc.meta}</span>
        <span className="mono tnum w-12.5 text-right text-xs text-muted-foreground">
          {tc.ms}ms
        </span>
      </div>
      {open && (
        <div className="mono border-t border-border bg-code-bg px-3.5 py-2.5 text-xs leading-normal text-muted-foreground">
          {t("trace.tools.args")}: {tc.args}
          <br />
          {t("trace.tools.result")}: {tc.meta ?? "—"} {t("trace.tools.previewTruncated")}
        </div>
      )}
    </div>
  );
}
