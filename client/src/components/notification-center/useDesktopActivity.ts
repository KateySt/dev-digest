"use client";

import React from "react";
import { useActivity, useNotifications } from "@/lib/hooks";
import { useDesktop } from "@/lib/desktop";

/**
 * Desktop app only: pushes "how many things are running" and the unread
 * notification count to the main process, which renders them as the taskbar
 * progress indicator, the unread badge and the tray status. No-op in a browser
 * (and /activity is not even polled there).
 */
export function useDesktopActivity(): void {
  const desktop = useDesktop();
  const { data: activity } = useActivity(!!desktop);
  const { data: notifications } = useNotifications();

  const running = activity ? activity.reviews_running + activity.evals_running : 0;
  const unread = notifications?.unread ?? 0;

  React.useEffect(() => {
    void desktop?.app.setActivity({ running, unread });
  }, [desktop, running, unread]);
}
