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
