/* Docs sync schedule: on/off, time, repeat (once / daily / selected days) and
   a one-off "next run only" override. Edits stay in a local draft until Save. */
"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { DocSyncSchedule, DocSyncScheduleUpdate } from "@devdigest/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrefRow } from "../../../PrefRow";
import {
  WEEKDAYS,
  browserTimeZone,
  formatWhen,
  isDraftValid,
  toDraft,
  toUpdate,
  weekdayLabel,
  type RepeatMode,
  type ScheduleDraft,
} from "../../helpers";

const MODES: RepeatMode[] = ["once", "daily", "days"];

export function ScheduleForm({
  schedule,
  saving,
  onSave,
}: {
  schedule: DocSyncSchedule;
  saving: boolean;
  onSave: (update: DocSyncScheduleUpdate, done: () => void) => void;
}) {
  const t = useTranslations("settings.docSync");
  const locale = useLocale();
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const form = draft ?? toDraft(schedule);
  const timezone = browserTimeZone();
  const edit = (patch: Partial<ScheduleDraft>) => setDraft({ ...form, ...patch });
  const toggleDay = (day: number) =>
    edit({ days: form.days.includes(day) ? form.days.filter((d) => d !== day) : [...form.days, day].sort() });

  return (
    <section className="mb-8">
      <h3 className="mb-2 text-lg font-semibold">{t("scheduleTitle")}</h3>
      <PrefRow
        label={t("enabledLabel")}
        hint={t("enabledHint")}
        on={form.enabled}
        onChange={(enabled) => edit({ enabled })}
      />
      <fieldset disabled={!form.enabled} className="mt-5 disabled:opacity-60">
        <div className="flex flex-wrap gap-x-4">
          <div className="w-[140px]">
            <FormField label={t("timeLabel")} htmlFor="doc-sync-time">
              <Input
                id="doc-sync-time"
                type="time"
                value={form.time}
                onChange={(e) => edit({ time: e.target.value })}
              />
            </FormField>
          </div>
          <div className="w-[240px]">
            <FormField label={t("repeatLabel")}>
              <Select value={form.mode} onValueChange={(mode) => edit({ mode: mode as RepeatMode })}>
                <SelectTrigger className="w-full" aria-label={t("repeatLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`repeat.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </div>
        {form.mode === "days" && (
          <FormField label={t("daysLabel")}>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const on = form.days.includes(day);
                return (
                  <Button
                    key={day}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    aria-pressed={on}
                    className="min-w-11"
                    onClick={() => toggleDay(day)}
                  >
                    {weekdayLabel(day, locale)}
                  </Button>
                );
              })}
            </div>
          </FormField>
        )}
        <FormField label={t("overrideLabel")} hint={t("overrideHint")} htmlFor="doc-sync-override">
          <div className="flex max-w-[320px] gap-2">
            <Input
              id="doc-sync-override"
              type="datetime-local"
              value={form.override}
              onChange={(e) => edit({ override: e.target.value })}
            />
            {form.override && (
              <Button type="button" variant="ghost" onClick={() => edit({ override: "" })}>
                {t("clearOverride")}
              </Button>
            )}
          </div>
        </FormField>
      </fieldset>
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          {schedule.next_run_at
            ? t("nextRun", { when: formatWhen(schedule.next_run_at, locale) })
            : t("nextRunNone")}
          {schedule.last_run_at && <> · {t("lastRun", { when: formatWhen(schedule.last_run_at, locale) })}</>}
        </p>
        <p className="text-subtle-foreground">
          {t("timezone", { tz: timezone })} {t("catchUp")}
        </p>
      </div>
      <Button
        className="mt-4"
        disabled={!draft || !isDraftValid(form) || saving}
        onClick={() => onSave(toUpdate(form, timezone), () => setDraft(null))}
      >
        {t("save")}
      </Button>
    </section>
  );
}
