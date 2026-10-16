/** Default settings section when none is provided in the route. */
export const DEFAULT_SECTION = "api-keys";

/** Section keys that have a bespoke implemented panel. */
export const SECTION_API_KEYS = "api-keys";
export const SECTION_MODELS = "models";
export const SECTION_CATALOG = "catalog";
export const SECTION_NOTIFICATIONS = "notifications";
export const SECTION_APPEARANCE = "appearance";

/** Sub-nav order. Labels come from `settings.sections.<key>` in messages/en/settings.json. */
export const SETTINGS_SECTIONS = [
  SECTION_API_KEYS,
  SECTION_MODELS,
  SECTION_CATALOG,
  SECTION_NOTIFICATIONS,
  SECTION_APPEARANCE,
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
