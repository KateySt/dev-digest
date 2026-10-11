"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { notificationPrefs, useSettings, type AppNotification } from "@/lib/hooks";
import { useDesktop } from "@/lib/desktop";

/**
 * Desktop app only: turns streamed notifications into OS notifications (with
 * the system sound unless muted in Settings → Notifications) and opens the
 * route a clicked OS notification points at. In a browser it is a no-op.
 */
export function useDesktopNotifier(): (n: AppNotification) => void {
  const desktop = useDesktop();
  const router = useRouter();
  const { data: settings } = useSettings();
  const prefs = notificationPrefs(settings);

  React.useEffect(() => desktop?.app.onNavigate((href) => router.push(href)), [desktop, router]);

  return React.useCallback(
    (n: AppNotification) => {
      if (!desktop || !prefs.desktop) return;
      void desktop.app.notify({ title: n.title, body: n.body, href: n.href, silent: !prefs.sound });
    },
    [desktop, prefs.desktop, prefs.sound],
  );
}
