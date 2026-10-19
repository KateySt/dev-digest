/* NotificationCenter — the top-bar bell: unread badge + a popover of finished
   long-running operations (reviews, evals, clone/index, onboarding tours).
   Click a row to open its result (marks it read); hover to toggle read or
   remove; header/footer for "mark all read" and "clear all". Kept fresh by
   the notifications SSE stream; in the desktop app each new one also becomes
   an OS notification (useDesktopNotifier), and what is running feeds the
   taskbar/tray (useDesktopActivity). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  useClearNotifications,
  NOTIFICATIONS_PAGE,
  useInvalidateActivity,
  useMarkAllNotificationsRead,
  useNotifications,
  useNotificationStream,
  useRemoveNotification,
  useSetNotificationRead,
  type AppNotification,
} from "@/lib/hooks";
import { NotificationItem } from "./NotificationItem";
import { useDesktopActivity } from "./useDesktopActivity";
import { useDesktopNotifier } from "./useDesktopNotifier";

export function NotificationCenter({ onNotification }: { onNotification?: (n: AppNotification) => void }) {
  const t = useTranslations("shell.notifications");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  // "Load more" grows the window by NOTIFICATIONS_PAGE; it starts over when the popover reopens.
  const [limit, setLimit] = React.useState(NOTIFICATIONS_PAGE);
  React.useEffect(() => {
    if (!open) setLimit(NOTIFICATIONS_PAGE);
  }, [open]);
  const { data, isFetching } = useNotifications(limit);
  const { mutate: setRead } = useSetNotificationRead();
  const { mutate: markAll, isPending: markingAll } = useMarkAllNotificationsRead();
  const { mutate: remove } = useRemoveNotification();
  const { mutate: clear } = useClearNotifications();
  const notifyDesktop = useDesktopNotifier();
  const invalidateActivity = useInvalidateActivity();
  useDesktopActivity();
  useNotificationStream((n) => {
    void invalidateActivity();
    notifyDesktop(n);
    onNotification?.(n);
  });

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const openItem = (n: AppNotification) => {
    if (!n.read) setRead({ id: n.id, read: true });
    if (n.href) {
      setOpen(false);
      router.push(n.href);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={unread ? t("labelUnread", { count: unread }) : t("label")}
        className={cn(
          "app-no-drag relative grid size-8 cursor-pointer place-items-center rounded-[7px] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          open && "bg-accent",
        )}
      >
        <Icon.Bell size={16} aria-hidden />
        {unread > 0 && (
          <span className="absolute top-0.5 right-px h-4 min-w-4 rounded-full bg-crit px-1 text-center text-[10px] leading-4 font-bold text-white shadow-[0_0_0_2px_var(--bg-primary)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        aria-label={t("title")}
        className="w-[380px] overflow-hidden rounded-2xl border-border bg-elevated p-0 shadow-modal"
      >
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
          <span className="text-base font-bold">{t("title")}</span>
          {unread > 0 && (
            <span className="rounded-full bg-brand-bg px-1.75 py-px text-2xs font-bold text-brand-text">
              {t("newCount", { count: unread })}
            </span>
          )}
          <button
            type="button"
            disabled={unread === 0 || markingAll}
            onClick={() => markAll()}
            className="ml-auto cursor-pointer border-none bg-transparent p-0 text-ui font-semibold text-brand-text disabled:cursor-default disabled:text-subtle-foreground"
          >
            {t("markAllRead")}
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-9 text-center text-subtle-foreground">
            <Icon.Bell size={22} aria-hidden />
            <div className="text-base font-semibold text-foreground">{t("emptyTitle")}</div>
            <div className="text-ui leading-normal">{t("emptyBody")}</div>
          </div>
        ) : (
          <>
            <ul className="m-0 max-h-[440px] list-none overflow-y-auto p-0">
              {items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onOpen={() => openItem(n)}
                  onToggleRead={() => setRead({ id: n.id, read: !n.read })}
                  onRemove={() => remove(n.id)}
                />
              ))}
              {data?.total !== undefined && items.length < data.total && (
                <li className="flex justify-center border-t border-border py-2">
                  <button
                    type="button"
                    disabled={isFetching}
                    onClick={() => setLimit((n) => n + NOTIFICATIONS_PAGE)}
                    className="cursor-pointer border-none bg-transparent text-ui font-semibold text-primary hover:underline disabled:cursor-default disabled:opacity-60"
                  >
                    {t("loadMore", { shown: items.length, total: data.total })}
                  </button>
                </li>
              )}
            </ul>
            <div className="flex justify-center border-t border-border px-3.5 py-2">
              <button
                type="button"
                onClick={() => clear()}
                className="inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent text-ui text-muted-foreground hover:text-foreground"
              >
                <Icon.Trash size={13} aria-hidden /> {t("clearAll")}
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
