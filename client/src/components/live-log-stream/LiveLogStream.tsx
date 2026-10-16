/* LiveLogStream — scrollable, filterable, copyable run-log viewer with a
   "running" pulse. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LOG_KIND_CLASS, type LogLine } from "./constants";

export function LiveLogStream({
  log,
  running,
  height = 260,
  elapsedLabel,
}: {
  log: LogLine[];
  running?: boolean;
  height?: number;
  elapsedLabel?: string;
}) {
  const t = useTranslations("common.logStream");
  const [filter, setFilter] = React.useState("");
  const needle = filter.trim().toLowerCase();
  const shown = needle ? log.filter((l) => l.m.toLowerCase().includes(needle) || l.k.includes(needle)) : log;

  // Copy the (filtered) log to the clipboard, with brief visual confirmation.
  const [copied, setCopied] = React.useState(false);
  const copyLog = () => {
    const text = shown.map((l) => `[${l.t}] [${l.k}] ${l.m}`).join("\n");
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const copyLabel = copied ? t("copied") : t("copy");

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-code-bg">
      <div className="flex items-center gap-2.5 border-b border-border bg-surface px-3.5 py-2.5">
        <div className="flex w-[170px] items-center gap-2 rounded-md border border-border bg-elevated px-2.5 py-1">
          <Icon.Search size={12} className="text-subtle-foreground" aria-hidden />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("filter")}
            aria-label={t("filter")}
            className="flex-1 border-none bg-transparent text-xs text-foreground outline-none"
          />
        </div>
        {running ? (
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-warn">
            <span className="size-[7px] animate-dd-pulse rounded-full bg-warn" />
            {elapsedLabel ?? t("running")}
          </span>
        ) : (
          <span className="text-xs text-subtle-foreground">{t("lines", { count: shown.length })}</span>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label={copyLabel}
          title={copyLabel}
          onClick={copyLog}
        >
          {copied ? <Icon.Check /> : <Icon.Copy />}
        </Button>
      </div>
      <div
        className="flex h-(--log-h) flex-col gap-1 overflow-auto px-3.5 py-3"
        style={{ "--log-h": `${height}px` } as React.CSSProperties}
      >
        {shown.map((l, i) => (
          <div key={i} className="mono flex animate-dd-fadein gap-2.5 text-xs leading-normal">
            <span className="shrink-0 text-subtle-foreground">[{l.t}]</span>
            <span className={cn("shrink-0 font-semibold", LOG_KIND_CLASS[l.k])}>[{l.k}]</span>
            <span className="text-foreground">{l.m}</span>
          </div>
        ))}
        {running && (
          <div className="mono text-xs text-subtle-foreground">
            <span className="inline-block h-[13px] w-[7px] animate-dd-pulse bg-ok align-middle" />
          </div>
        )}
      </div>
    </div>
  );
}
