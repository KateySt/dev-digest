/* Settings → Keyboard (SPEC-11 AC-17 – AC-35, AC-44/AC-45): every command in
   the keyboard registry, grouped, with its effective binding. Change records a
   new combination (validated, conflict-checked, global ones confirmed by the
   desktop), Reset drops the override, Disable stores "no binding". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BindingKeys,
  COMMAND_GROUPS,
  chordFromEvent,
  findConflict,
  isSingleKey,
  useCommandLabel,
  useKeyboard,
  validateBinding,
  type Binding,
  type CommandDef,
} from "@/components/keyboard";
import { cn } from "@/lib/utils";
import { PrefRow } from "../PrefRow";
import { SectionTitle } from "../SectionTitle";
import { bindingHasChord, rowAnchor } from "./helpers";
import { useBindingRecorder, type RecorderResult } from "./useBindingRecorder";

type RowNote = { kind: "error"; text: string } | { kind: "conflict"; binding: Binding; otherId: string };

const SEARCH_BOX = "flex items-center gap-2.5 rounded-[7px] border border-border bg-surface px-3 py-2";

export function SettingsKeyboard() {
  const t = useTranslations("settings.keyboard");
  const label = useCommandLabel();
  const kb = useKeyboard();
  const { platform, commands, effective, overrides, singleKey, globalStatus, setBindings, setSingleKey, resetAll, setRecording } = kb;

  const [query, setQuery] = React.useState("");
  const [keySearch, setKeySearch] = React.useState<{ on: boolean; chord: string | null }>({ on: false, chord: null });
  const [editing, setEditing] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, RowNote | undefined>>({});

  // The dispatcher must not fire while keys are being captured here.
  React.useEffect(() => {
    setRecording(!!editing || keySearch.on);
    return () => setRecording(false);
  }, [editing, keySearch.on, setRecording]);

  // Deep links (#kb-window-toggle from Settings → Desktop) scroll to the row.
  React.useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, []);

  const setNote = (id: string, note?: RowNote) => setNotes((n) => ({ ...n, [id]: note }));
  const commandName = (id: string) => {
    const c = commands.find((x) => x.id === id);
    return c ? label(c) : id;
  };

  const save = async (patch: Record<string, Binding | null | undefined>, rowId: string) => {
    const res = await setBindings(patch);
    if (!res.ok) setNote(rowId, { kind: "error", text: t(`errors.${res.reason}`) });
    else setNote(rowId, undefined);
  };

  const onRecorded = async (cmd: CommandDef, r: RecorderResult) => {
    setEditing(null);
    if (r.kind === "cancel") return;
    if (r.kind === "disable") return save({ [cmd.id]: null }, cmd.id);
    const error = validateBinding(cmd, r.binding, platform);
    if (error) return setNote(cmd.id, { kind: "error", text: t(`errors.${error}`) });
    const otherId = findConflict(cmd.id, r.binding, effective);
    if (otherId) return setNote(cmd.id, { kind: "conflict", binding: r.binding, otherId });
    return save({ [cmd.id]: r.binding }, cmd.id);
  };

  const q = query.trim().toLowerCase();
  const visible = commands.filter((c) => {
    if (keySearch.on && keySearch.chord) return bindingHasChord(effective.get(c.id) ?? null, keySearch.chord);
    return !q || label(c).toLowerCase().includes(q);
  });

  return (
    <div className="max-w-[760px]">
      <SectionTitle title={t("title")} body={t("body")} />
      <PrefRow label={t("singleKeyLabel")} hint={t("singleKeyHint")} on={singleKey} onChange={setSingleKey} />

      <div className="mt-5 mb-3 flex flex-wrap items-center gap-2.5">
        {keySearch.on ? (
          <div className={cn(SEARCH_BOX, "min-w-60 flex-1")}>
            <Icon.Keyboard size={13} className="shrink-0 text-subtle-foreground" aria-hidden />
            <input
              autoFocus
              readOnly
              aria-label={t("searchByKeys")}
              value=""
              placeholder={keySearch.chord ? "" : t("searchByKeysPrompt")}
              onKeyDown={(e) => {
                e.preventDefault();
                const chord = chordFromEvent(e.nativeEvent, platform);
                if (chord) setKeySearch({ on: true, chord });
              }}
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
            />
            {keySearch.chord && <BindingKeys binding={keySearch.chord} />}
          </div>
        ) : (
          <div className={cn(SEARCH_BOX, "min-w-60 flex-1")}>
            <Icon.Search size={13} className="shrink-0 text-subtle-foreground" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
            />
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          aria-pressed={keySearch.on}
          data-active={keySearch.on}
          onClick={() => setKeySearch((s) => ({ on: !s.on, chord: null }))}
        >
          <Icon.Keyboard aria-hidden />
          {keySearch.on ? t("clearKeySearch") : t("searchByKeys")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={Object.keys(overrides).length === 0}
          onClick={() => {
            if (window.confirm(t("resetAllConfirm"))) {
              resetAll();
              setNotes({});
            }
          }}
        >
          {t("resetAll")}
        </Button>
      </div>

      {visible.length === 0 && <p className="py-6 text-sm text-subtle-foreground">{t("noMatches")}</p>}

      {COMMAND_GROUPS.map((group) => {
        const rows = visible.filter((c) => c.group === group);
        if (!rows.length) return null;
        return (
          <section key={group} className="mb-6">
            <h3 className="mb-1.5 text-xs font-bold tracking-[0.06em] text-subtle-foreground uppercase">
              {/* group names are shared with the ? sheet */}
              <GroupName group={group} />
            </h3>
            <ul className="rounded-lg border border-border bg-surface">
              {rows.map((cmd) => (
                <KeyboardRow
                  key={cmd.id}
                  cmd={cmd}
                  name={label(cmd)}
                  binding={effective.get(cmd.id) ?? null}
                  modified={Object.hasOwn(overrides, cmd.id)}
                  off={!singleKey}
                  notActive={cmd.owner === "os" && !!globalStatus[cmd.id] && globalStatus[cmd.id] !== "ok"}
                  editing={editing === cmd.id}
                  note={notes[cmd.id]}
                  conflictName={(id) => commandName(id)}
                  onEdit={() => {
                    setNote(cmd.id, undefined);
                    setEditing(cmd.id);
                  }}
                  onRecorded={(r) => void onRecorded(cmd, r)}
                  onReset={() => void save({ [cmd.id]: undefined }, cmd.id)}
                  onDisable={() => void save({ [cmd.id]: null }, cmd.id)}
                  onReplace={(binding, otherId) => void save({ [cmd.id]: binding, [otherId]: null }, cmd.id)}
                  onDismissNote={() => setNote(cmd.id, undefined)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function GroupName({ group }: { group: string }) {
  const t = useTranslations("shell.keyboard.groups");
  return <>{t(group)}</>;
}

function KeyboardRow({
  cmd,
  name,
  binding,
  modified,
  off,
  notActive,
  editing,
  note,
  conflictName,
  onEdit,
  onRecorded,
  onReset,
  onDisable,
  onReplace,
  onDismissNote,
}: {
  cmd: CommandDef;
  name: string;
  binding: Binding | null;
  modified: boolean;
  off: boolean;
  notActive: boolean;
  editing: boolean;
  note?: RowNote;
  conflictName: (id: string) => string;
  onEdit: () => void;
  onRecorded: (r: RecorderResult) => void;
  onReset: () => void;
  onDisable: () => void;
  onReplace: (binding: Binding, otherId: string) => void;
  onDismissNote: () => void;
}) {
  const t = useTranslations("settings.keyboard");
  const { platform } = useKeyboard();
  const allowSequence = cmd.owner === "studio" && !!cmd.defaults[platform]?.includes(" ");
  const recorder = useBindingRecorder({ platform, allowSequence, onDone: onRecorded });

  return (
    <li id={rowAnchor(cmd.id)} className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-50 flex-1">
          <span className="text-sm text-foreground">{name}</span>
          {cmd.owner === "os" && (
            <Badge variant="neutral" className="ml-2">
              {t("global")}
            </Badge>
          )}
          {modified && (
            <Badge variant="brand" className="ml-2">
              {t("modified")}
            </Badge>
          )}
          {notActive && <div className="mt-0.5 text-xs text-warn">{t("notActive")}</div>}
        </div>

        {editing ? (
          <div
            role="textbox"
            tabIndex={0}
            aria-label={t("recordingFor", { command: name })}
            aria-live="polite"
            onKeyDown={recorder.onKeyDown}
            onBlur={() => onRecorded({ kind: "cancel" })}
            ref={(el) => el?.focus()}
            className="flex min-w-50 items-center gap-2 rounded-md border border-primary bg-elevated px-2.5 py-1 text-xs text-muted-foreground outline-none"
          >
            {recorder.first ? <BindingKeys binding={recorder.first} /> : t("recording")}
          </div>
        ) : binding ? (
          <BindingKeys binding={binding} off={off && isSingleKey(binding)} />
        ) : (
          <span className="text-xs text-subtle-foreground">{t("notSet")}</span>
        )}

        {!editing && cmd.rebindable && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="xs" onClick={onEdit} aria-label={t("changeFor", { command: name })}>
              {t("change")}
            </Button>
            {modified && (
              <Button variant="ghost" size="xs" onClick={onReset} aria-label={t("resetFor", { command: name })}>
                {t("reset")}
              </Button>
            )}
            {binding && (
              <Button variant="ghost" size="xs" onClick={onDisable} aria-label={t("disableFor", { command: name })}>
                {t("disable")}
              </Button>
            )}
          </div>
        )}
      </div>

      {note?.kind === "error" && (
        <p role="alert" className="mt-1.5 text-xs text-crit">
          {note.text}
        </p>
      )}
      {note?.kind === "conflict" && (
        <div role="alert" className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-warn">
          <BindingKeys binding={note.binding} />
          <span>{t("conflict", { command: conflictName(note.otherId) })}</span>
          <Button variant="secondary" size="xs" onClick={() => onReplace(note.binding, note.otherId)}>
            {t("replace")}
          </Button>
          <Button variant="ghost" size="xs" onClick={onDismissNote}>
            {t("cancel")}
          </Button>
        </div>
      )}
    </li>
  );
}
