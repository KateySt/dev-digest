# Notifications — development plan

**Date:** 2026-10-11 · **Branch:** `emdash/notifications`

## Goal

Long-running operations finish in the background, and today the user only finds
out if they are on the page that polls for them. Add a notification center: a
bell in the top bar with an unread badge and a dropdown list (open the result,
mark read, remove, mark all read, clear all), plus OS notifications with sound
in the desktop app.

## Decisions (agreed with the user)

| Topic | Decision |
|---|---|
| Sources (v1) | Review run (single agent, rerun), multi-agent review, "Review all" (one per PR), agent/skill eval suite, repo clone, repo-intel indexing, onboarding tour generation, operations interrupted by a restart |
| Not notified | Inline operations the user waits for on screen (conventions, CI export, skill import, intent/brief/blast) |
| Grouping | Multi-agent and "Review all" → one summary when the last run of the group finishes |
| Failures | Notified too, with an error status |
| OS toast | Desktop app only, and only while the DevDigest window is not focused; system sound |
| Settings | Settings → Notifications: "Desktop notifications" and "Sound" toggles |
| Retention | Last 200 per workspace, at most 30 days |

## Design

### Server — `modules/notifications/` (+ `platform/notification-bus.ts`)
- Table `notifications`: `workspace_id`, `kind`, `status` (success / error /
  info), `title`, `body`, `href`, `read_at`, `created_at`.
- `NotificationsService.notify()` is the one entry point producers call
  (`container.notifications`). It never throws: a failed notification must not
  fail the operation that triggered it.
- `NotificationBus` (in-memory, per workspace) pushes new rows to
  `GET /notifications/stream` (SSE). Unlike `runBus`, it is not per run.
- REST: `GET /notifications` (list + unread count), `POST /notifications/:id/read`,
  `POST /notifications/read-all`, `DELETE /notifications/:id`, `DELETE /notifications`.
- Producer hooks at the terminal points: `reviews/run-executor.ts`,
  `eval/service.ts`, `repos/service.ts` (clone), `repo-intel/service.ts`
  (index), `onboarding/service.ts` (also stop swallowing generation errors),
  boot reapers in `app.ts`.

### Client
- `useNotifications()` / mutations in `lib/hooks/notifications.ts`;
  `useNotificationStream()` (EventSource → cache invalidation, polling fallback).
- `NotificationCenter` in the top bar (`ShellContext.notifications` slot,
  replacing the decorative bell).

### Desktop (phase 2)
- Bridge `notify({ title, body, href })` → Electron `Notification` (system
  sound unless muted); click focuses the window and opens `href`.
- `app.setAppUserModelId('dev.devdigest.app')` — Windows drops toasts from an
  installed app without it.
- Settings toggles stored as non-secret prefs (`settings` table).

## Phases
1. Server module + producers + bell dropdown (web and desktop).
2. OS notifications with sound + Settings → Notifications.

## Verification
Unit tests for the helpers (titles/hrefs per source), the service (never
throws, retention), routes (smoke), client hooks + `NotificationCenter`;
manual check in the browser on an isolated stack; OS toasts checked on a
desktop build.
