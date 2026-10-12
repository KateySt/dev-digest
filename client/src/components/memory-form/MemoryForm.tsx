/* MemoryForm — controlled editor for one memory (SPEC-2026-10-12-memory).
   Shared by the Learn modal (FindingCard) and the Memory page's Edit mode.
   No fetching inside: the parent passes options, similar matches and handlers. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, FormField, Textarea } from "@devdigest/ui";
import {
  MEMORY_CONTENT_MAX,
  type MemoryInput,
  type MemoryKind,
  type MemoryLink,
  type MemorySource,
  type MemorySummary,
} from "@devdigest/shared";
import { s } from "./styles";

const KINDS: MemoryKind[] = ["learning", "fact", "convention", "decision", "preference"];

export interface LinkOption {
  id: string;
  name: string;
}

/** Same rules the server enforces (content length, at least one target). */
export function isMemoryFormValid(v: MemoryInput): boolean {
  const len = v.content.trim().length;
  return len > 0 && len <= MEMORY_CONTENT_MAX && (v.applies_to_all_agents || v.links.length > 0);
}

const hasLink = (links: MemoryLink[], kind: MemoryLink["target_kind"], id: string) =>
  links.some((l) => l.target_kind === kind && l.target_id === id);

export function MemoryForm({
  value,
  onChange,
  repoId,
  repoLabel,
  agentOptions,
  skillOptions,
  similar,
  onMerge,
  mergePending,
  readOnlySource,
}: {
  value: MemoryInput;
  onChange: (v: MemoryInput) => void;
  /** Repo used when scope = "repo" (the PR's repo, or the memory's own). */
  repoId: string | null;
  repoLabel?: string | null;
  agentOptions: LinkOption[];
  skillOptions: LinkOption[];
  similar?: MemorySummary[];
  onMerge?: (memoryId: string) => void;
  mergePending?: boolean;
  readOnlySource?: MemorySource | null;
}) {
  const t = useTranslations("memory");
  const set = (patch: Partial<MemoryInput>) => onChange({ ...value, ...patch });
  const toggleLink = (kind: MemoryLink["target_kind"], id: string) =>
    set({
      links: hasLink(value.links, kind, id)
        ? value.links.filter((l) => !(l.target_kind === kind && l.target_id === id))
        : [...value.links, { target_kind: kind, target_id: id }],
    });
  const tooLong = value.content.trim().length > MEMORY_CONTENT_MAX;
  const noTarget = !value.applies_to_all_agents && value.links.length === 0;

  return (
    <div>
      {similar && similar.length > 0 && (
        <div style={s.similarBox}>
          <div style={s.similarTitle}>{t("form.similarTitle")}</div>
          {similar.map((m) => (
            <div key={m.id} style={s.similarRow}>
              <span style={s.similarText}>{m.content}</span>
              {onMerge && (
                <Button kind="secondary" size="sm" disabled={mergePending} onClick={() => onMerge(m.id)}>
                  {t("form.merge")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <FormField
        label={t("form.content")}
        hint={t("form.contentHint")}
        right={
          <span style={s.counter(tooLong)}>
            {t("form.contentCount", { count: value.content.trim().length, max: MEMORY_CONTENT_MAX })}
          </span>
        }
      >
        <Textarea value={value.content} onChange={(content) => set({ content })} rows={4} />
        {tooLong && <div style={s.error}>{t("form.contentTooLong", { max: MEMORY_CONTENT_MAX })}</div>}
      </FormField>

      <FormField label={t("form.kind")}>
        <div style={s.segment}>
          {KINDS.map((k) => (
            <Button key={k} kind="secondary" size="sm" active={value.kind === k} aria-pressed={value.kind === k} onClick={() => set({ kind: k })}>
              {t(`kind.${k}`)}
            </Button>
          ))}
        </div>
      </FormField>

      <FormField label={t("form.scope")}>
        <div style={s.segment}>
          <Button
            kind="secondary"
            size="sm"
            active={value.scope === "repo"}
            aria-pressed={value.scope === "repo"}
            disabled={!repoId}
            title={repoLabel ?? undefined}
            onClick={() => set({ scope: "repo", repo_id: repoId })}
          >
            {t("form.scopeRepo")}
          </Button>
          <Button
            kind="secondary"
            size="sm"
            active={value.scope === "global"}
            aria-pressed={value.scope === "global"}
            onClick={() => set({ scope: "global", repo_id: null })}
          >
            {t("form.scopeGlobal")}
          </Button>
        </div>
      </FormField>

      <FormField label={t("form.links")}>
        <div style={s.linkGroup}>
          <Checkbox
            checked={value.applies_to_all_agents}
            onChange={(v) => set({ applies_to_all_agents: v })}
            label={t("form.allAgents")}
          />
          {!value.applies_to_all_agents && (
            <>
              {agentOptions.length > 0 && <div style={s.linkGroupLabel}>{t("form.agents")}</div>}
              {agentOptions.map((a) => (
                <Checkbox
                  key={a.id}
                  checked={hasLink(value.links, "agent", a.id)}
                  onChange={() => toggleLink("agent", a.id)}
                  label={a.name}
                />
              ))}
              {skillOptions.length > 0 && <div style={s.linkGroupLabel}>{t("form.skills")}</div>}
              {skillOptions.map((sk) => (
                <Checkbox
                  key={sk.id}
                  checked={hasLink(value.links, "skill", sk.id)}
                  onChange={() => toggleLink("skill", sk.id)}
                  label={sk.name}
                />
              ))}
            </>
          )}
          {noTarget && <div style={s.error}>{t("form.noLinks")}</div>}
        </div>
      </FormField>

      <FormField label={t("form.globs")} hint={t("form.globsHint")}>
        <GlobsInput globs={value.path_globs} onChange={(path_globs) => set({ path_globs })} label={t("form.globs")} />
      </FormField>

      {readOnlySource && (
        <div style={s.source}>
          {t("form.source")}:{" "}
          {readOnlySource.pr != null ? t("form.sourcePr", { pr: readOnlySource.pr }) : null} {readOnlySource.context}
        </div>
      )}
    </div>
  );
}

/** One glob per line. Keeps the raw text locally so blank lines / trailing
 *  spaces don't fight the cursor; the parsed list goes to the parent. */
function GlobsInput({ globs, onChange, label }: { globs: string[]; onChange: (g: string[]) => void; label: string }) {
  const [text, setText] = React.useState(() => globs.join("\n"));
  return (
    <textarea
      aria-label={label}
      className="mono"
      rows={2}
      value={text}
      placeholder="src/middleware/**"
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split("\n")
            .map((g) => g.trim())
            .filter(Boolean),
        );
      }}
      style={s.textarea}
    />
  );
}
