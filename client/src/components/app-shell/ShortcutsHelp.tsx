/* ShortcutsHelp — keyboard-shortcuts cheat sheet (triggered by `?`). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { SHORTCUTS, type ShortcutDef, type ShortcutGroup } from "./nav";

const GROUPS: ShortcutGroup[] = ["global", "navigation", "findings"];

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("shell");
  const label = (s: ShortcutDef) =>
    s.navKey ? t("shortcuts.goTo", { label: t(`nav.${s.navKey}`) }) : t(`shortcuts.${s.label!}`);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-border-strong bg-elevated shadow-modal sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{t("shortcuts.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("shortcuts.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4.5">
          {GROUPS.map((g) => (
            <section key={g}>
              <h3 className="mb-2.5 text-xs font-bold tracking-[0.06em] text-subtle-foreground uppercase">
                {t(`shortcuts.groups.${g}`)}
              </h3>
              <ul className="flex flex-col gap-2">
                {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                  <li key={s.keys} className="flex items-center gap-2.5 text-sm">
                    <span className="flex-1 text-muted-foreground">{label(s)}</span>
                    {s.keys.split(" ").map((k, i) => (
                      <Kbd key={i} className="mono border border-border-strong bg-surface">
                        {k}
                      </Kbd>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
