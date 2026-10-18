/* ShellKeyboard — registers the app-wide keyboard commands (SPEC-11) for as
   long as the shell is mounted. Renders nothing; lives inside SidebarProvider
   so it can toggle the sidebar. Page-scoped commands (findings) are
   registered by their pages. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSidebar } from "@/components/ui/sidebar";
import { useKeyboard, SIDEBAR_ITEMS } from "@/components/keyboard";
import { notify } from "@/lib/contexts/toast";
import { useActiveRepo } from "@/lib/contexts/repoContext";
import { useTheme } from "@/lib/contexts/theme";
import { useDesktop } from "@/lib/desktop";
import { NOTIFICATION_PREF_KEYS, notificationPrefs, useSettings, useUpdateSettings } from "@/lib/hooks";
import { SETTINGS_ITEM, resolveHref } from "./nav";

export function ShellKeyboard({ onOpenPalette, onOpenHelp }: { onOpenPalette: () => void; onOpenHelp: () => void }) {
  const t = useTranslations("shell.keyboard.toggled");
  const router = useRouter();
  const { repoId } = useActiveRepo();
  const { toggleSidebar } = useSidebar();
  const { theme, toggle: toggleTheme } = useTheme();
  const { data: settings } = useSettings();
  const { mutate: updateSettings } = useUpdateSettings();
  const desktop = useDesktop();
  const { register } = useKeyboard();
  const sound = notificationPrefs(settings).sound;

  React.useEffect(() => {
    const go = (href: string) => () => router.push(href);
    const handlers: Record<string, () => void> = {
      "palette.open": onOpenPalette,
      "help.show": onOpenHelp,
      "sidebar.toggle": toggleSidebar,
      // Toggles confirm the new state with a toast (AC-38).
      "theme.toggle": () => {
        toggleTheme();
        notify.info(t("theme", { state: t(theme === "dark" ? "light" : "dark") }));
      },
      "sound.toggle": () => {
        updateSettings({ [NOTIFICATION_PREF_KEYS.sound]: !sound });
        notify.info(t("sound", { state: t(sound ? "off" : "on") }));
      },
      "nav.settings": go(SETTINGS_ITEM.href),
      "desktop.settings": go(SETTINGS_ITEM.href),
      "desktop.back": () => router.back(),
      "desktop.forward": () => router.forward(),
    };
    for (const it of SIDEBAR_ITEMS) handlers[`nav.${it.key}`] = go(resolveHref(it.href, repoId));
    // Mod+1…9 follow the sidebar's order (SPEC-11 Q2).
    SIDEBAR_ITEMS.slice(0, 9).forEach((it, i) => {
      handlers[`desktop.section.${i + 1}`] = go(resolveHref(it.href, repoId));
    });
    if (desktop) {
      handlers["desktop.trayToggle"] = () => {
        void desktop.app.getPrefs().then(async (p) => {
          const next = await desktop.app.setPrefs({ closeToTray: !p.closeToTray });
          notify.info(t("tray", { state: t(next.closeToTray ? "on" : "off") }));
        });
      };
    }
    const offs = Object.entries(handlers).map(([id, fn]) => register(id, fn));
    return () => offs.forEach((off) => off());
  }, [register, router, repoId, onOpenPalette, onOpenHelp, toggleSidebar, toggleTheme, theme, sound, updateSettings, desktop, t]);

  return null;
}
