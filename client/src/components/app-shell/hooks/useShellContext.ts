"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "@/lib/contexts/theme";
import { useActiveRepo } from "@/lib/contexts/repoContext";
import { usePulls, useDeleteRepo } from "@/lib/hooks";
import { AccountMenu } from "@/components/account-menu";
import { NotificationCenter } from "@/components/notification-center";
import { WindowControls } from "@/components/window-chrome";
import { useDesktop } from "@/lib/desktop";
import { activeKeyFor, toShellRepo } from "../helpers";
import type { ShellContext } from "../types";

interface ShellContextOptions {
  onOpenCommandPalette: () => void;
}

/**
 * Assembles the `ShellContext` consumed by the sidebar and top bar: active nav key, the repo
 * list/active repo (mapped to the shell shape), theme, PR count, the repo
 * selection / add / removal actions, the account menu, and — in the desktop
 * app — the title-bar window controls.
 */
export function useShellContext({ onOpenCommandPalette }: ShellContextOptions): ShellContext {
  const t = useTranslations("shell");
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { repoId, repos, activeRepo, setRepoId } = useActiveRepo();
  const { data: pulls } = usePulls(repoId);
  const deleteRepo = useDeleteRepo();
  const desktop = useDesktop();

  const onSelectRepo = React.useCallback(
    (id: string) => {
      setRepoId(id);
      router.push(`/repos/${id}/pulls`);
    },
    [setRepoId, router],
  );

  const onAddRepo = React.useCallback(() => router.push("/onboarding"), [router]);

  const onRemoveRepo = React.useCallback(
    (id: string) => {
      const target = repos.find((r) => r.id === id);
      const ok = window.confirm(
        t("removeRepo.confirm", { name: target?.full_name ?? t("removeRepo.fallbackName") }),
      );
      if (!ok) return;
      deleteRepo.mutate(id, {
        onSuccess: () => {
          if (repoId === id) {
            const next = repos.find((r) => r.id !== id);
            router.push(next ? `/repos/${next.id}/pulls` : "/onboarding");
          }
        },
      });
    },
    [repos, repoId, t, deleteRepo, router],
  );

  return React.useMemo<ShellContext>(
    () => ({
      activeKey: activeKeyFor(pathname),
      repoId: repoId ?? null,
      repos: repos.map(toShellRepo),
      activeRepo: activeRepo ? toShellRepo(activeRepo) : null,
      theme,
      onToggleTheme: toggle,
      onOpenCommandPalette,
      onSelectRepo,
      onAddRepo,
      onRemoveRepo,
      // Sidebar badge = PRs that still NEED review, not the total PR count.
      // 0 → undefined so the badge hides entirely when nothing needs review.
      prCount: pulls?.filter((p) => p.status === "needs_review").length || undefined,
      notifications: React.createElement(NotificationCenter),
      account: React.createElement(AccountMenu),
      // Desktop app: the top bar is the window's title bar.
      windowControls: desktop ? React.createElement(WindowControls) : undefined,
      desktop: Boolean(desktop),
      macTrafficLights: desktop?.platform === "darwin",
    }),
    [
      pathname,
      repoId,
      repos,
      activeRepo,
      theme,
      toggle,
      onOpenCommandPalette,
      onSelectRepo,
      onAddRepo,
      onRemoveRepo,
      pulls,
      desktop,
    ],
  );
}
