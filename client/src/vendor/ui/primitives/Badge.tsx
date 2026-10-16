import React from "react";
import { Icon, type IconName } from "../icons";

export function Badge({
  children,
  color = "var(--text-secondary)",
  bg = "var(--bg-hover)",
  icon,
  dot,
  mono,
  style,
}: {
  children?: React.ReactNode;
  color?: string;
  bg?: string;
  icon?: IconName;
  dot?: boolean;
  mono?: boolean;
  style?: React.CSSProperties;
}) {
  const I = icon ? Icon[icon] : null;
  return (
    <span
      className={mono ? "mono" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: 5,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: bg,
        letterSpacing: mono ? 0 : "0.01em",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: 99, background: color }} />
      )}
      {I && <I size={12} />}
      {children}
    </span>
  );
}
