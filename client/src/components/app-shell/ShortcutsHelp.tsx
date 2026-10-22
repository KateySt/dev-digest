/* ShortcutsHelp — keyboard-shortcuts cheat sheet (triggered by `?`). Reads the
   keyboard command registry, so it always shows the effective bindings,
   including the user's own (SPEC-11 AC-8/AC-9/AC-35). */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BindingKeys, COMMAND_GROUPS, isSingleKey, useCommandLabel, useKeyboard } from "@/components/keyboard";

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("shell");
  const label = useCommandLabel();
  const { commands, effective, singleKey } = useKeyboard();

  const groups = COMMAND_GROUPS.map((g) => ({
    group: g,
    rows: commands.filter((c) => c.group === g && effective.get(c.id)),
  })).filter((g) => g.rows.length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("shortcuts.description")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid max-h-[70vh] grid-cols-2 gap-x-6 gap-y-4.5 overflow-auto p-6">
          {groups.map(({ group, rows }) => (
            <section key={group}>
              <h3 className="mb-2.5 text-xs font-bold tracking-[0.06em] text-subtle-foreground uppercase">
                {t(`keyboard.groups.${group}`)}
              </h3>
              <ul className="flex flex-col gap-2">
                {rows.map((c) => {
                  const binding = effective.get(c.id)!;
                  const off = !singleKey && isSingleKey(binding);
                  return (
                    <li key={c.id} className="flex items-center gap-2.5 text-sm">
                      <span className="flex-1 text-muted-foreground">{label(c)}</span>
                      <BindingKeys binding={binding} off={off} />
                      {off && <span className="sr-only">{t("keyboard.off")}</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </DialogBody>
        <div className="border-t border-border px-6 py-3 text-right">
          <Link href="/settings/keyboard" onClick={onClose} className="text-sm font-semibold text-primary">
            {t("keyboard.customize")}
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
