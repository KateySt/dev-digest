import React from "react";
import { Icon } from "../icons";

type SelectOption = string | { value: string; label: string };
const optValue = (o: SelectOption) => (typeof o === "string" ? o : o.value);
const optLabel = (o: SelectOption) => (typeof o === "string" ? o : o.label);

/**
 * Custom single-select dropdown (no native <select>) — the popup list is real
 * DOM we theme ourselves, since a native <select>'s option list is rendered
 * by the OS/browser and ignores our CSS variables. Same options API as
 * SearchableSelect, minus the filter box; use SearchableSelect instead for
 * long lists (e.g. the 300+ OpenRouter models).
 */
export function Select({
  value,
  onChange,
  options,
  mono = true,
  maxHeight = 280,
}: {
  value: string;
  onChange?: (v: string) => void;
  options: SelectOption[];
  mono?: boolean;
  maxHeight?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  React.useEffect(() => {
    if (open) setHi(Math.max(options.findIndex((o) => optValue(o) === value), 0));
  }, [open, options, value]);

  const current = options.find((o) => optValue(o) === value);
  const currentLabel = current ? optLabel(current) : value;
  const interactive = Boolean(onChange);

  const pick = (o: SelectOption) => {
    onChange?.(optValue(o));
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!interactive) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setHi((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const o = options[hi];
      if (o) pick(o);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        role="button"
        tabIndex={interactive ? 0 : -1}
        onClick={() => interactive && setOpen((o) => !o)}
        onKeyDown={onKey}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 7,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-elevated)",
          cursor: interactive ? "pointer" : "default",
        }}
      >
        <span
          className={mono ? "mono" : undefined}
          style={{
            flex: 1,
            fontSize: 14,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {currentLabel}
        </span>
        <Icon.ChevronsUpDown size={14} style={{ color: "var(--text-muted)", pointerEvents: "none" }} />
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: 9,
            boxShadow: "var(--shadow-modal)",
            zIndex: 40,
            maxHeight,
            overflowY: "auto",
            padding: 6,
            animation: "ddpop .12s ease",
          }}
        >
          {options.map((o, i) => {
            const v = optValue(o);
            const sel = v === value;
            const hot = i === hi;
            return (
              <button
                key={v}
                type="button"
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(o)}
                className={mono ? "mono" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: hot ? "var(--bg-hover)" : "transparent",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <Icon.Check
                  size={13}
                  style={{ color: sel ? "var(--text-primary)" : "transparent", flexShrink: 0 }}
                />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {optLabel(o)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
