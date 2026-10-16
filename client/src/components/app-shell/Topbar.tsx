"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import type { Crumb, ShellContext } from "./types";

/** Top bar: breadcrumb, command-palette search, theme toggle, notifications,
 *  account, and (desktop app) window controls. Doubles as the window drag area. */
export function Topbar({ ctx, crumb = [] }: { ctx: ShellContext; crumb?: Crumb[] }) {
  const t = useTranslations("shell.topbar");
  const themeLabel = t("toggleTheme");
  return (
    <header
      className={cn(
        "app-drag flex h-13 shrink-0 items-center gap-4 border-b border-border bg-background",
        // Window controls sit flush against the right edge, full height.
        ctx.windowControls ? "pl-6" : "px-6",
      )}
    >
      <nav aria-label={t("breadcrumb")} className="min-w-0">
        <ol className="flex items-center gap-2">
          {crumb.map((c, i) => {
            const last = i === crumb.length - 1;
            const text = (
              <span
                className={cn(
                  "text-base whitespace-nowrap",
                  c.mono && "mono",
                  last ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                )}
                aria-current={last ? "page" : undefined}
              >
                {c.label}
              </span>
            );
            return (
              <li key={i} className="flex items-center gap-2">
                {i > 0 && <Icon.ChevronRight size={13} className="shrink-0 text-subtle-foreground" aria-hidden />}
                {c.href ? <Link href={c.href}>{text}</Link> : text}
              </li>
            );
          })}
        </ol>
      </nav>
      <button
        type="button"
        onClick={ctx.onOpenCommandPalette}
        className="ml-auto flex w-[260px] items-center gap-2.5 rounded-[7px] border border-border bg-surface px-3.5 py-2 text-sm text-subtle-foreground transition-colors hover:border-border-strong"
      >
        <span className="flex-1 text-left">{t("search")}</span>
        <Kbd className="mono border border-border-strong bg-surface">⌘K</Kbd>
      </button>
      <Button variant="ghost" size="icon-sm" aria-label={themeLabel} title={themeLabel} onClick={ctx.onToggleTheme}>
        {ctx.theme === "light" ? <Icon.Moon /> : <Icon.Sun />}
      </Button>
      {ctx.notifications}
      {ctx.account}
      {ctx.windowControls}
    </header>
  );
}
