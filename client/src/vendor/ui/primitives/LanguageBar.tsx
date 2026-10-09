import React from "react";

/**
 * GitHub-linguist-ish colors for common languages. Anything not listed falls
 * back to a deterministic grey shade (hashed from the name) so the bar still
 * renders sensibly for languages we haven't hand-mapped.
 */
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4F5D95",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Dockerfile: "#384d54",
  Vue: "#41b883",
  Elixir: "#6e4a7e",
  Scala: "#c22d40",
  Dart: "#00B4AB",
  Lua: "#000080",
  Haskell: "#5e5086",
  Solidity: "#AA6746",
  MDX: "#fcb32c",
  Markdown: "#083fa1",
  YAML: "#cb171e",
};

const FALLBACK_HUES = ["#9ca3af", "#71717a", "#64748b", "#78716c"];

function colorFor(lang: string): string {
  if (LANGUAGE_COLORS[lang]) return LANGUAGE_COLORS[lang];
  let hash = 0;
  for (let i = 0; i < lang.length; i++) hash = (hash * 31 + lang.charCodeAt(i)) >>> 0;
  return FALLBACK_HUES[hash % FALLBACK_HUES.length]!;
}

export interface LanguageStat {
  name: string;
  pct: number;
  color: string;
}

/** Bytes-per-language → sorted percentage breakdown (empty when there's no data). */
export function languageStats(languages: Record<string, number> | null | undefined): LanguageStat[] {
  if (!languages) return [];
  const total = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0);
  if (total <= 0) return [];
  return Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .map(([name, bytes]) => ({ name, pct: (bytes / total) * 100, color: colorFor(name) }));
}

/** GitHub-style stacked language bar, optionally with a percentage legend below it. */
export function LanguageBar({
  languages,
  height = 6,
  showLegend = false,
  maxLegendItems = 5,
}: {
  languages: Record<string, number> | null | undefined;
  height?: number;
  showLegend?: boolean;
  maxLegendItems?: number;
}) {
  const stats = languageStats(languages);
  if (stats.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      <div
        title={stats.map((s) => `${s.name} ${s.pct.toFixed(1)}%`).join(" · ")}
        style={{
          display: "flex",
          width: "100%",
          height,
          borderRadius: 99,
          overflow: "hidden",
          background: "var(--bg-hover)",
        }}
      >
        {stats.map((s) => (
          <div
            key={s.name}
            style={{ width: `${s.pct}%`, background: s.color }}
          />
        ))}
      </div>
      {showLegend && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12, color: "var(--text-secondary)" }}>
          {stats.slice(0, maxLegendItems).map((s) => (
            <span key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  background: s.color,
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              {s.name} <span className="mono tnum">{s.pct.toFixed(1)}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
