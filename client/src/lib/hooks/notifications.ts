/* hooks/notifications.ts — the notification center: list + unread count,
   read / remove mutations, and the live SSE stream that keeps it fresh. */
"use client";

import React from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "../api";

// TODO: move to @devdigest/shared once the vendored contracts are re-synced.
export type NotificationStatus = "success" | "error" | "info";
export interface AppNotification {
  id: string;
  kind: "review" | "multi_agent" | "eval" | "clone" | "index" | "onboarding" | "interrupted";
  status: NotificationStatus;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  created_at: string;
}
export interface NotificationList {
  items: AppNotification[];
  unread: number;
}

/** Safety net if the stream drops (sleep, proxy, API restart). */
const FALLBACK_POLL_MS = 60_000;

export const notificationQueries = {
  list: () =>
    queryOptions({
      queryKey: ["notifications"],
      queryFn: () => api.get<NotificationList>("/notifications"),
      refetchInterval: FALLBACK_POLL_MS,
    }),
};

export function useNotifications() {
  return useQuery(notificationQueries.list());
}

function useInvalidateNotifications() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: notificationQueries.list().queryKey });
}

export function useSetNotificationRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      api.post<{ ok: true }>(`/notifications/${id}/read`, { read }),
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>("/notifications/read-all"),
    onSuccess: invalidate,
  });
}

export function useRemoveNotification() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/notifications/${id}`),
    onSuccess: invalidate,
  });
}

export function useClearNotifications() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: () => api.del<{ ok: true }>("/notifications"),
    onSuccess: invalidate,
  });
}

/**
 * Live stream of new notifications (GET /notifications/stream). Each one
 * refreshes the list and is handed to `onNotification` (the desktop app turns
 * it into an OS notification). EventSource reconnects by itself after a drop;
 * the list's fallback poll covers anything missed meanwhile.
 */
export function useNotificationStream(onNotification?: (n: AppNotification) => void) {
  const invalidate = useInvalidateNotifications();
  const handlerRef = React.useRef(onNotification);
  handlerRef.current = onNotification;
  const invalidateRef = React.useRef(invalidate);
  invalidateRef.current = invalidate;

  React.useEffect(() => {
    const es = new EventSource(`${API_BASE}/notifications/stream`);
    es.addEventListener("notification", (ev) => {
      void invalidateRef.current();
      try {
        handlerRef.current?.(JSON.parse((ev as MessageEvent).data) as AppNotification);
      } catch {
        /* malformed frame — the list refresh above still picks it up */
      }
    });
    return () => es.close();
  }, []);
}
