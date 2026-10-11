import type { CSSProperties } from "react";

/** Windows-style caption buttons: 46px wide, full bar height, close turns red. */
export const s = {
  controls: (height: number): CSSProperties => ({ display: "flex", alignSelf: "stretch", height, flexShrink: 0 }),
  button: (hover: boolean, danger: boolean): CSSProperties => ({
    width: 46,
    height: "100%",
    display: "grid",
    placeItems: "center",
    border: "none",
    borderRadius: 0,
    padding: 0,
    cursor: "default",
    background: hover ? (danger ? "#e81123" : "var(--bg-hover)") : "transparent",
    color: hover && danger ? "#fff" : "var(--text-secondary)",
    transition: "background 80ms linear, color 80ms linear",
  }),
  strip: (height: number): CSSProperties => ({
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    height,
    display: "flex",
    justifyContent: "flex-end",
    zIndex: 50,
  }),
} as const;
