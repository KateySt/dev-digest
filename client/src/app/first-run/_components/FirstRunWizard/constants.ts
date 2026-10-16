import type { ConnTestProvider } from "@/lib/types";

/** LLM providers offered on the first step — any one of them unlocks reviews. */
export const LLM_PROVIDERS = ["openai", "anthropic", "openrouter"] as const satisfies readonly ConnTestProvider[];

/** "Where to get your key" targets (opened in the system browser by the desktop shell). */
export const KEY_URLS: Record<ConnTestProvider, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  openrouter: "https://openrouter.ai/settings/keys",
  github: "https://github.com/settings/personal-access-tokens/new",
};

/** Class strings shared by the step bodies (KeyStep / RepoStep). */
export const STEP = {
  title: "text-3xl font-bold tracking-[-0.02em]",
  body: "mt-2 mb-6 text-base leading-normal text-muted-foreground",
  actions: "mt-6 flex items-center gap-3",
  link: "text-sm text-brand-text no-underline",
  note: "-mt-3 inline-flex items-center gap-1.5 text-xs text-subtle-foreground",
  result: "mt-4 flex items-center gap-2.5 rounded-lg border px-3.5 py-3 text-sm text-muted-foreground",
  resultOk: "border-ok/25 bg-ok-bg",
  resultFail: "border-crit/25 bg-crit-bg",
} as const;
