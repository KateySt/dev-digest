import React from "react";
import { Icon } from "../icons";
import { type TabDef } from "./types";

export function Tabs({
  tabs,
  value,
  onChange,
  pad = "0 28px",
}: {
  tabs: TabDef[];
  value: string;
  onChange: (k: string) => void;
  pad?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: pad,
        // Inset shadow instead of border-bottom: the active underline paints over it
        // without a negative margin, so nothing overflows vertically.
        boxShadow: "inset 0 -1px 0 var(--border)",
        overflowX: "auto",
        overflowY: "hidden",
      }}
    >
      {tabs.map((t) => {
        const k = typeof t === "string" ? t : t.key;
        const label = typeof t === "string" ? t : t.label;
        const icon = typeof t === "object" ? t.icon : undefined;
        const on = value === k;
        const I = icon ? Icon[icon] : null;
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 16px",
              border: "none",
              background: "transparent",
              borderBottom: "2px solid " + (on ? "var(--accent)" : "transparent"),
              cursor: "pointer",
              fontSize: 14,
              fontWeight: on ? 600 : 500,
              color: on ? "var(--text-primary)" : "var(--text-secondary)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {I && <I size={14} style={{ color: on ? "var(--accent)" : "var(--text-muted)" }} />}
            {label}
            {typeof t === "object" && t.count != null && (
              <span className="tnum" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
