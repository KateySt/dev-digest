/* MemoryForm — controlled editor for one memory (SPEC-2026-10-12-memory).
   Shared by the Learn modal (FindingCard) and the Memory page's Edit mode.
   No fetching inside: the parent passes options, similar matches and handlers. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  MEMORY_CONTENT_MAX, MEMORY_MAX_GLOBS,
  type MemoryInput,
  type MemoryKind,
  type MemoryLink,
  type MemorySource,
  type MemorySummary,
} from "@devdigest/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ERROR = "mt-1.5 text-ui text-crit";
const SEGMENT = "flex flex-wrap gap-1.5";
const GROUP_LABEL = "mt-1.5 text-2xs font-semibold tracking-[0.4px] text-subtle-foreground uppercase";

/** Checkbox with its visible label (the label names the checkbox). */
function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  );
}

const KINDS: MemoryKind[] = ["learning", "fact", "convention", "decision", "preference"];

export interface LinkOption {
  id: string;
  name: string;
}

/** Same rules the server enforces (content length, at least one target). */
export function isMemoryFormValid(v: MemoryInput): boolean {
  const len = v.content.trim().length;
  return (
    len > 0 &&
    len <= MEMORY_CONTENT_MAX &&
    v.path_globs.length <= MEMORY_MAX_GLOBS &&
    (v.applies_to_all_agents || v.links.length > 0)
  );
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
        <div className="mb-5 flex flex-col gap-2.5 rounded-lg border border-warn p-3">
          <div className="text-sm font-semibold text-warn">{t("form.similarTitle")}</div>
          {similar.map((m) => (
            <div key={m.id} className="flex items-start gap-2.5">
              <span className="min-w-0 flex-1 text-sm text-muted-foreground wrap-anywhere">{m.content}</span>
              {onMerge && (
                <Button variant="secondary" size="sm" disabled={mergePending} onClick={() => onMerge(m.id)}>
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
          <span className={cn("text-xs", tooLong ? "text-crit" : "text-subtle-foreground")}>
            {t("form.contentCount", { count: value.content.trim().length, max: MEMORY_CONTENT_MAX })}
          </span>
        }
      >
        <Textarea value={value.content} onChange={(e) => set({ content: e.target.value })} rows={4} />
        {tooLong && <div className={ERROR}>{t("form.contentTooLong", { max: MEMORY_CONTENT_MAX })}</div>}
      </FormField>

      <FormField label={t("form.kind")}>
        <div className={SEGMENT}>
          {KINDS.map((k) => (
            <Button key={k} variant="outline" size="sm" data-active={value.kind === k} aria-pressed={value.kind === k} onClick={() => set({ kind: k })}>
              {t(`kind.${k}`)}
            </Button>
          ))}
        </div>
      </FormField>

      <FormField label={t("form.scope")}>
        <div className={SEGMENT}>
          <Button
            variant="outline"
            size="sm"
            data-active={value.scope === "repo"}
            aria-pressed={value.scope === "repo"}
            disabled={!repoId}
            title={repoLabel ?? undefined}
            onClick={() => set({ scope: "repo", repo_id: repoId })}
          >
            {t("form.scopeRepo")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-active={value.scope === "global"}
            aria-pressed={value.scope === "global"}
            onClick={() => set({ scope: "global", repo_id: null })}
          >
            {t("form.scopeGlobal")}
          </Button>
        </div>
      </FormField>

      <FormField label={t("form.links")}>
        <div className="flex flex-col gap-2">
          <CheckRow
            checked={value.applies_to_all_agents}
            onChange={(v) => set({ applies_to_all_agents: v })}
            label={t("form.allAgents")}
          />
          {!value.applies_to_all_agents && (
            <>
              {agentOptions.length > 0 && <div className={GROUP_LABEL}>{t("form.agents")}</div>}
              {agentOptions.map((a) => (
                <CheckRow
                  key={a.id}
                  checked={hasLink(value.links, "agent", a.id)}
                  onChange={() => toggleLink("agent", a.id)}
                  label={a.name}
                />
              ))}
              {skillOptions.length > 0 && <div className={GROUP_LABEL}>{t("form.skills")}</div>}
              {skillOptions.map((sk) => (
                <CheckRow
                  key={sk.id}
                  checked={hasLink(value.links, "skill", sk.id)}
                  onChange={() => toggleLink("skill", sk.id)}
                  label={sk.name}
                />
              ))}
            </>
          )}
          {noTarget && <div className={ERROR}>{t("form.noLinks")}</div>}
        </div>
      </FormField>

      <FormField label={t("form.globs")} hint={t("form.globsHint")}>
        <GlobsInput globs={value.path_globs} onChange={(path_globs) => set({ path_globs })} label={t("form.globs")} placeholder={t("form.globsPlaceholder")} />
        {value.path_globs.length > MEMORY_MAX_GLOBS && (
          <div className={ERROR}>{t("form.tooManyGlobs", { max: MEMORY_MAX_GLOBS })}</div>
        )}
      </FormField>

      {readOnlySource && (
        <div className="text-ui text-subtle-foreground">
          {t("form.source")}:{" "}
          {readOnlySource.pr != null ? t("form.sourcePr", { pr: readOnlySource.pr }) : null} {readOnlySource.context}
        </div>
      )}
    </div>
  );
}

/** One glob per line. Keeps the raw text locally so blank lines / trailing
 *  spaces don't fight the cursor; the parsed list goes to the parent. */
function GlobsInput({
  globs,
  onChange,
  label,
  placeholder,
}: {
  globs: string[];
  onChange: (g: string[]) => void;
  label: string;
  placeholder: string;
}) {
  const [text, setText] = React.useState(() => globs.join("\n"));
  return (
    <Textarea
      aria-label={label}
      className="mono"
      rows={2}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split("\n")
            .map((g) => g.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
