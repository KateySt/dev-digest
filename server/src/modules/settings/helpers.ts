import type { Settings } from '@devdigest/shared';

/** A persisted settings key/value row (non-secret prefs). */
export interface SettingsRow {
  key: string;
  value: unknown;
}

/** Collapse key/value setting rows into a flat `Settings` object. */
export function rowsToSettings(rows: SettingsRow[]): Settings {
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

/** The GitHub account behind the configured token (the studio's active user). */
export interface GithubAccount {
  login: string;
  avatar_url: string;
  html_url: string;
}

// TODO: move to @devdigest/shared once the vendored contracts are re-synced.
export interface GithubAccountResponse {
  account: GithubAccount | null;
}

/**
 * Build the account card from the login alone: github.com serves every user's
 * avatar at /<login>.png, so no extra API call (or GitHubClient change) is needed.
 */
export function githubAccount(login: string): GithubAccount {
  const html_url = `https://github.com/${encodeURIComponent(login)}`;
  return { login, avatar_url: `${html_url}.png?size=64`, html_url };
}
