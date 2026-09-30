import React from "react";

export function MonoLink({
  children,
  onClick,
  href,
  wrap,
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  /** When set, renders an anchor that opens in a new tab (middle-click works). */
  href?: string;
  /**
   * Opt-in (default false — every existing call site is unaffected):
   * lets a long unbroken path/string wrap inside its own box instead of
   * overflowing its container (client/INSIGHTS.md's recorded suggestion for
   * exactly this — a 4th call site needing wrap behavior, rather than a
   * fifth copy-pasted override). Not the primitive's default because
   * `.mono`/`nowrap` + horizontal scroll is the CORRECT behavior at other
   * call sites (diff viewer, code snippets).
   */
  wrap?: boolean;
}) {
  const [h, setH] = React.useState(false);
  const style: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 13,
    cursor: "pointer",
    color: h ? "var(--accent-text)" : "var(--text-secondary)",
    textDecoration: h ? "underline" : "none",
    textUnderlineOffset: 2,
    ...(wrap ? { overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 } : {}),
  };

  if (href) {
    return (
      <a
        className="mono"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setH(true)}
        onMouseLeave={() => setH(false)}
        style={style}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      className="mono"
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={style}
    >
      {children}
    </button>
  );
}
