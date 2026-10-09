"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
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

  if (commands.length === 0) return <div style={s.empty}>{t("empty")}</div>;

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
    <ol style={s.list}>
      {commands.map((c) => (
        <li key={c.order} style={s.row}>
          <span className="mono" style={s.order}>
            {c.order}.
          </span>
          <span className="mono" style={s.command}>
            {c.command}
          </span>
          <button
            type="button"
            onClick={() => copy(c.command, c.order)}
            aria-label={t("copyCommand", { command: c.command })}
            title={t("copyCommand", { command: c.command })}
            style={s.copyBtn}
          >
            <Icon.Copy size={14} />
          </button>
          {copiedOrder === c.order && (
            <span role="status" style={s.copied}>
              {t("copied")}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

const s = {
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 } as React.CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } as React.CSSProperties,
  order: { fontSize: 12.5, color: "var(--text-muted)", flexShrink: 0 } as React.CSSProperties,
  command: {
    fontSize: 13,
    color: "var(--text-primary)",
    flex: 1,
    minWidth: 0,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  } as React.CSSProperties,
  copyBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    display: "inline-flex",
    color: "var(--text-muted)",
    flexShrink: 0,
  } as React.CSSProperties,
  copied: { fontSize: 11.5, color: "var(--ok)", flexShrink: 0 } as React.CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "4px 0" } as React.CSSProperties,
};

export default RunLocallySection;
