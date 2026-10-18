/* Pure helpers for the Settings view. */
import { DEFAULT_SECTION, SECTION_DESKTOP, SETTINGS_SECTIONS, type SettingsSection } from "./constants";

/** Sub-nav sections for this runtime — Desktop only inside the desktop app (SPEC-11 AC-39). */
export function visibleSections(desktop: boolean): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((key) => key !== SECTION_DESKTOP || desktop);
}

/** The section to render for a URL segment; unknown or unavailable ones fall back to the default. */
export function resolveSection(param: string | undefined, desktop: boolean): SettingsSection {
  return visibleSections(desktop).find((key) => key === param) ?? (DEFAULT_SECTION as SettingsSection);
}
