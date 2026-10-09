/** Secret name the generated workflow reads for a provider's API key.
 *  Mirrors `providerSecretKey` in `server/src/modules/ci/helpers.ts`
 *  (unknown providers fall back to OPENAI_API_KEY there too). */
const PROVIDER_SECRET_KEY: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export function providerSecretKey(provider: string): string {
  return PROVIDER_SECRET_KEY[provider] ?? "OPENAI_API_KEY";
}
