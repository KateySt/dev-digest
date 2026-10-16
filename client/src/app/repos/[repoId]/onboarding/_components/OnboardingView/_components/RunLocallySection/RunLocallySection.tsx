"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import type { OnboardingRunCommand } from "@/lib/types";

/**
 * How to run locally (C-AC-13, C-AC-14, C-AC-15): `run_commands` as
 * numbered monospace rows, each with its own copy action placing EXACTLY
 * that command's text on the clipboard. Empty → an explicit "none found"
 * state, never a blank card and never an invented command.
 */
export function RunLocallySection({ commands }: { commands: OnboardingRunCommand[] }) {
  const t = useTranslations("onboarding.sections.runLocally");
  const [copiedOrder, setCopiedOrder] = React.useState<number | null>(null);

  if (commands.length === 0) return <div className="py-1 text-sm text-subtle-foreground">{t("empty")}</div>;

  const copy = async (command: string, order: number) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedOrder(order);
      window.setTimeout(() => setCopiedOrder((o) => (o === order ? null : o)), 1500);
    } catch {
      // Clipboard unavailable (permissions/non-secure context) — the
      // command text is still fully visible and selectable, no error UX
      // needed for a nice-to-have convenience action.
    }
  };

  return (
    <ol className="m-0 flex min-w-0 list-none flex-col gap-2 p-0">
      {commands.map((c) => (
        <li key={c.order} className="flex min-w-0 items-center gap-2">
          <span className="mono shrink-0 text-ui text-subtle-foreground">
            {c.order}.
          </span>
          <span className="mono min-w-0 flex-1 text-sm text-foreground wrap-anywhere break-words">
            {c.command}
          </span>
          <button
            type="button"
            onClick={() => copy(c.command, c.order)}
            aria-label={t("copyCommand", { command: c.command })}
            title={t("copyCommand", { command: c.command })}
            className="inline-flex shrink-0 cursor-pointer border-none bg-transparent p-1 text-subtle-foreground hover:text-foreground"
          >
            <Icon.Copy size={14} aria-hidden />
          </button>
          {copiedOrder === c.order && (
            <span role="status" className="shrink-0 text-[11.5px] text-ok">
              {t("copied")}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export default RunLocallySection;
