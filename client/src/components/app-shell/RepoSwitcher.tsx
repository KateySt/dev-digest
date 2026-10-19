"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ShellContext } from "./types";

/** Repo picker at the top of the sidebar: switch, add, or remove a repo.
 *  `compact`: the sidebar's icon rail — only the repo icon, name in the trigger's title. */
export function RepoSwitcher({ ctx, compact = false }: { ctx: ShellContext; compact?: boolean }) {
  const t = useTranslations("shell.repoSwitcher");
  const active = ctx.activeRepo;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("label")}
        title={compact ? (active?.full_name ?? t("noRepo")) : undefined}
        className={cn(
          "mb-2 flex w-full items-center gap-2.5 rounded-[7px] border border-border bg-elevated px-3.5 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact && "justify-center px-0 py-2",
        )}
      >
        <span className="grid size-6.5 shrink-0 place-items-center rounded-md bg-linear-135 from-blue-500 to-violet-500">
          <Icon.GitBranch size={14} className="text-white" aria-hidden />
        </span>
        <span className={cn("min-w-0 flex-1", compact && "sr-only")}>
          <span className="mono block truncate text-sm font-semibold">{active?.full_name ?? t("noRepo")}</span>
          <span className="block text-xs text-subtle-foreground">
            {active
              ? `${active.default_branch ?? t("defaultBranch")} · ${active.synced ? t("synced") : t("notSynced")}`
              : t("addRepoHint")}
          </span>
        </span>
        {!compact && <Icon.ChevronsUpDown size={14} className="text-subtle-foreground" aria-hidden />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="dd-dropdown-panel max-h-80 w-60">
        {ctx.repos.map((r) => (
          <DropdownMenuItem key={r.id} onSelect={() => ctx.onSelectRepo(r.id)} className="group/repo gap-2">
            <Icon.GitBranch aria-hidden />
            <span className="mono flex-1 truncate text-sm">{r.full_name}</span>
            <button
              type="button"
              aria-label={t("remove", { name: r.full_name })}
              title={t("remove", { name: r.full_name })}
              // Keep the click from also selecting the repo.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                ctx.onRemoveRepo(r.id);
              }}
              className="grid size-5 place-items-center rounded-sm text-subtle-foreground opacity-0 group-hover/repo:opacity-100 group-focus/repo:opacity-100 hover:text-crit"
            >
              <Icon.Trash size={12} aria-hidden />
            </button>
          </DropdownMenuItem>
        ))}
        {ctx.repos.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={ctx.onAddRepo} className="gap-2 text-muted-foreground">
          <Icon.Plus aria-hidden />
          {t("addRepo")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
