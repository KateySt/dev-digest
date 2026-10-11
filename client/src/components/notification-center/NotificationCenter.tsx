/* NotificationCenter — the top-bar bell: unread badge + a dropdown of finished
   long-running operations (reviews, evals, clone/index, onboarding tours).
   Click a row to open its result (marks it read); hover to toggle read or
   remove; header/footer for "mark all read" and "clear all". Kept fresh by
   the notifications SSE stream; in the desktop app each new one also becomes
   an OS notification (useDesktopNotifier). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@devdigest/ui";
import {
  useClearNotifications,
  useMarkAllNotificationsRead,
  useNotifications,
  useNotificationStream,
  useRemoveNotification,
  useSetNotificationRead,
  type AppNotification,
} from "@/lib/hooks";
import { NotificationItem } from "./NotificationItem";
import { useDesktopNotifier } from "./useDesktopNotifier";
import { s } from "./styles";

export function NotificationCenter({ onNotification }: { onNotification?: (n: AppNotification) => void }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const { data } = useNotifications();
  const { mutate: setRead } = useSetNotificationRead();
  const { mutate: markAll, isPending: markingAll } = useMarkAllNotificationsRead();
  const { mutate: remove } = useRemoveNotification();
  const { mutate: clear } = useClearNotifications();
  const notifyDesktop = useDesktopNotifier();
  useNotificationStream((n) => {
    notifyDesktop(n);
    onNotification?.(n);
  });

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  // Close on outside click / Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = (n: AppNotification) => {
    if (!n.read) setRead({ id: n.id, read: true });
    if (n.href) {
      setOpen(false);
      router.push(n.href);
    }
  };

  return (
    <div ref={rootRef} style={s.root}>
      <button
        type="button"
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={s.bell(open)}
      >
        <Icon.Bell size={16} />
        {unread > 0 && <span style={s.badge}>{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" style={s.panel}>
          <div style={s.header}>
            <span style={s.heading}>Notifications</span>
            {unread > 0 && <span style={s.count}>{unread} new</span>}
            <button
              type="button"
              disabled={unread === 0 || markingAll}
              onClick={() => markAll()}
              style={s.textBtn(unread === 0)}
            >
              Mark all as read
            </button>
          </div>

          {items.length === 0 ? (
            <div style={s.empty}>
              <Icon.Bell size={22} />
              <div style={s.emptyTitle}>You&apos;re all caught up</div>
              <div style={s.emptyBody}>Finished reviews, evals, clones and onboarding tours show up here.</div>
            </div>
          ) : (
            <>
              <ul style={{ ...s.list, listStyle: "none", margin: 0, padding: 0 }}>
                {items.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onOpen={() => openItem(n)}
                    onToggleRead={() => setRead({ id: n.id, read: !n.read })}
                    onRemove={() => remove(n.id)}
                  />
                ))}
              </ul>
              <div style={s.footer}>
                <button type="button" onClick={() => clear()} style={s.clearBtn}>
                  <Icon.Trash size={13} /> Clear all
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
