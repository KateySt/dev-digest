/* CommandPalette — Cmd+K palette over the shell's command list (cmdk). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import type { Command } from "./types";

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}) {
  const t = useTranslations("shell.palette");
  // Keep the registration order of groups (nav sections first, then global).
  const groups = React.useMemo(() => {
    const byGroup = new Map<string, Command[]>();
    for (const c of commands) {
      const g = c.group ?? "";
      byGroup.set(g, [...(byGroup.get(g) ?? []), c]);
    }
    return [...byGroup.entries()];
  }, [commands]);

  const run = (c: Command) => {
    c.run();
    onClose();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={t("description")}
      className="top-[12vh] translate-y-0 border-border-strong bg-elevated shadow-modal sm:max-w-[560px]"
    >
      <CommandInput placeholder={t("placeholder")} />
      <CommandList className="max-h-[360px]">
        <CommandEmpty>{t("empty")}</CommandEmpty>
        {groups.map(([group, cmds]) => (
          <CommandGroup key={group} heading={group || undefined}>
            {cmds.map((c) => {
              const I = c.icon ? Icon[c.icon] : Icon.ArrowRight;
              return (
                <CommandItem key={c.id} value={`${c.label} ${group}`} onSelect={() => run(c)} className="gap-3 text-base">
                  <I className="text-subtle-foreground" aria-hidden />
                  <span className="flex-1">{c.label}</span>
                  {c.hint && <CommandShortcut className="mono">{c.hint}</CommandShortcut>}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
