/* NotificationItem — one row of the notification center: status icon, title,
   body, age; unread dot; hover actions (toggle read, remove). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import type { AppNotification, NotificationStatus } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { formatRelativeAge } from "@/lib/utils";

const STATUS_ICON = { success: Icon.CheckCircle, error: Icon.XCircle, info: Icon.Info } as const;
const STATUS_CLASS: Record<NotificationStatus, string> = {
  success: "text-ok",
  error: "text-crit",
  info: "text-primary",
};

const actionClass =
  "grid size-6.5 cursor-pointer place-items-center rounded-md border-none bg-elevated text-muted-foreground hover:text-foreground";

export function NotificationItem({
  notification: n,
  onOpen,
  onToggleRead,
  onRemove,
}: {
  notification: AppNotification;
  onOpen: () => void;
  onToggleRead: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("shell.notifications");
  // Hover/focus swaps the unread dot for the action buttons (rendered only
  // then, so each row exposes one set of actions at a time).
  const [hover, setHover] = React.useState(false);
  const StatusIcon = STATUS_ICON[n.status];
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const toggleLabel = n.read ? t("markUnread") : t("markRead");

  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={n.read ? n.title : t("unreadPrefix", { title: n.title })}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className={cn(
        "relative flex cursor-pointer gap-3 border-b border-border px-3.5 py-3",
        hover ? "bg-accent" : !n.read && "bg-surface",
      )}
    >
      <StatusIcon size={16} className={cn("mt-px shrink-0", STATUS_CLASS[n.status])} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className={cn("pr-11 text-sm", n.read ? "font-medium text-muted-foreground" : "font-bold text-foreground")}>
          {n.title}
        </div>
        {n.body && <div className="mt-0.75 line-clamp-2 text-ui leading-[1.45] text-muted-foreground">{n.body}</div>}
        <div className="mt-1.25 text-[11.5px] text-subtle-foreground">{formatRelativeAge(n.created_at)}</div>
      </div>
      {hover ? (
        <div className="absolute top-2 right-2 flex gap-0.5">
          <button type="button" title={toggleLabel} aria-label={toggleLabel} onClick={stop(onToggleRead)} className={actionClass}>
            {n.read ? <Icon.Dot size={18} aria-hidden /> : <Icon.Check size={14} aria-hidden />}
          </button>
          <button type="button" title={t("remove")} aria-label={t("remove")} onClick={stop(onRemove)} className={actionClass}>
            <Icon.X size={14} aria-hidden />
          </button>
        </div>
      ) : (
        !n.read && <span aria-hidden className="absolute top-4.25 right-3.5 size-2 rounded-full bg-primary" />
      )}
    </li>
  );
}
