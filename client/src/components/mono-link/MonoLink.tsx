import React from "react";
import { cn } from "@/lib/utils";

/**
 * Monospace path/identifier link. `wrap` (opt-in) lets a long unbroken string
 * wrap inside its own box instead of overflowing; it is not the default because
 * nowrap + horizontal scroll is the right behaviour at other call sites
 * (diff viewer, code snippets) — see client/INSIGHTS.md.
 */
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
  wrap?: boolean;
}) {
  const className = cn(
    "mono cursor-pointer border-none bg-transparent p-0 text-sm text-muted-foreground underline-offset-2 hover:text-brand-text hover:underline",
    // A <button> centres its text by default — wrapped lines must stay left-aligned.
    wrap && "min-w-0 text-left wrap-anywhere break-words",
  );

  if (href) {
    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  );
}
