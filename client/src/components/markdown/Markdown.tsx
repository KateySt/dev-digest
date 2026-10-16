import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown renderer (inline + GFM). Headings/lists/tables are restored by
 *  the `.dd-md` rules in globals.css; inline elements are styled here. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md leading-[1.55]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2.5">{children}</p>,
          strong: ({ children }) => <strong className="font-strong text-foreground">{children}</strong>,
          code: ({ children }) => (
            <code className="mono rounded-sm bg-muted px-1.5 py-px text-[0.92em] text-brand-text in-[pre]:bg-transparent in-[pre]:p-0">
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-brand-text underline">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
