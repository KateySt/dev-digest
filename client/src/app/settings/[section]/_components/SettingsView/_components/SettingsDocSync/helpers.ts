/* Pure helpers for Settings → Docs sync. */
import type { DocSyncSchedule, DocSyncScheduleUpdate } from "@devdigest/shared";

export type RepeatMode = "once" | "daily" | "days";

/** The editable form state; `override` is a `datetime-local` value ("" = none). */
export interface ScheduleDraft {
  enabled: boolean;
  time: string;
  mode: RepeatMode;
  days: number[];
  override: string;
}

/** ISO weekdays in display order, Monday first. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Short weekday name for an ISO weekday (2024-01-01 was a Monday). */
export function weekdayLabel(isoDay: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, isoDay)),
  );
}

/** ISO instant → `datetime-local` value in the browser's zone. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDraft(s: DocSyncSchedule): ScheduleDraft {
  return {
    enabled: s.enabled,
    time: s.time,
    mode: !s.repeat ? "once" : s.days.length > 0 ? "days" : "daily",
    days: s.days,
    override: isoToLocalInput(s.next_run_override),
  };
}

export function toUpdate(d: ScheduleDraft, timezone: string): DocSyncScheduleUpdate {
  return {
    enabled: d.enabled,
    time: d.time,
    repeat: d.mode !== "once",
    days: d.mode === "days" ? d.days : [],
    timezone,
    next_run_override: d.override ? new Date(d.override).toISOString() : null,
  };
}

/** "Selected days" with none selected would never run — not saveable. */
export function isDraftValid(d: ScheduleDraft): boolean {
  return /^\d{2}:\d{2}$/.test(d.time) && (d.mode !== "days" || d.days.length > 0);
}

export function formatWhen(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
