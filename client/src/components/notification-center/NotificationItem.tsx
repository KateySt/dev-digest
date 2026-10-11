/* NotificationItem — one row of the notification center: status icon, title,
   body, age; unread dot; hover actions (toggle read, remove). */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { AppNotification } from "@/lib/hooks";
import { formatRelativeAge } from "@/lib/utils";
import { s } from "./styles";

const STATUS_ICON = { success: Icon.CheckCircle, error: Icon.XCircle, info: Icon.Info } as const;

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
  const [hover, setHover] = React.useState(false);
  const StatusIcon = STATUS_ICON[n.status];
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={`${n.read ? "" : "Unread: "}${n.title}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={s.item(hover, !n.read)}
    >
      <StatusIcon size={16} style={s.statusIcon(n.status)} />
      <div style={s.itemText}>
        <div style={s.itemTitle(!n.read)}>{n.title}</div>
        {n.body && <div style={s.itemBody}>{n.body}</div>}
        <div style={s.itemTime}>{formatRelativeAge(n.created_at)}</div>
      </div>
      {hover ? (
        <div style={s.actions}>
          <button
            type="button"
            title={n.read ? "Mark as unread" : "Mark as read"}
            aria-label={n.read ? "Mark as unread" : "Mark as read"}
            onClick={stop(onToggleRead)}
            style={s.action}
          >
            {n.read ? <Icon.Dot size={18} /> : <Icon.Check size={14} />}
          </button>
          <button type="button" title="Remove" aria-label="Remove" onClick={stop(onRemove)} style={s.action}>
            <Icon.X size={14} />
          </button>
        </div>
      ) : (
        !n.read && <span aria-hidden style={s.unreadDot} />
      )}
    </li>
  );
}
