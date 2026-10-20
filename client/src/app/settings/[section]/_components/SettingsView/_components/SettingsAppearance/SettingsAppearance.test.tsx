
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/settings.json";
import { ThemeProvider } from "@/lib/contexts";
import { installFakeBridge, removeFakeBridge } from "@/test/fake-desktop-bridge";
import { SettingsAppearance } from "./SettingsAppearance";

const html = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  for (const attr of ["data-theme", "data-palette", "data-accent"]) html.removeAttribute(attr);
});
afterEach(() => {
  cleanup();
  removeFakeBridge();
  vi.restoreAllMocks();
});

/** Stub prefers-color-scheme and capture its change listener. */
function mockSystemScheme(dark: boolean) {
  const state = { dark, listener: null as (() => void) | null };
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query.includes("dark") ? state.dark : false;
        },
        media: query,
        addEventListener: (_: string, cb: () => void) => (state.listener = cb),
        removeEventListener: () => (state.listener = null),
      }) as unknown as MediaQueryList,
  );
  return {
    set(next: boolean) {
      state.dark = next;
      state.listener?.();
    },
  };
}

function renderPanel() {
  render(
    <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
      <ThemeProvider>
        <SettingsAppearance />
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

describe("SettingsAppearance", () => {
  it("starts on dark / classic / blue", () => {
    renderPanel();
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Classic" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Blue" })).toHaveAttribute("aria-checked", "true");
  });

  it("applies and persists a mode, palette and accent", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    fireEvent.click(screen.getByRole("radio", { name: "Stone" }));
    fireEvent.click(screen.getByRole("radio", { name: "Violet" }));

    expect(html).toHaveAttribute("data-theme", "light");
    expect(html).toHaveAttribute("data-palette", "stone");
    expect(html).toHaveAttribute("data-accent", "violet");
    expect(localStorage.getItem("dd-theme")).toBe("light");
    expect(localStorage.getItem("dd-palette")).toBe("stone");
    expect(localStorage.getItem("dd-accent")).toBe("violet");
    expect(screen.getByRole("radio", { name: "Violet" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Blue" })).toHaveAttribute("aria-checked", "false");
  });

  it("groups the radios under their labels", () => {
    renderPanel();
    const accentGroup = screen.getByRole("radiogroup", { name: "Accent" });
    expect(accentGroup.querySelectorAll('[role="radio"]')).toHaveLength(4);
  });

  it("System follows prefers-color-scheme, live, but stores \"system\"", () => {
    const scheme = mockSystemScheme(false);
    renderPanel();
    fireEvent.click(screen.getByRole("radio", { name: "System" }));

    expect(html).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("dd-theme")).toBe("system");
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");

    act(() => scheme.set(true));
    expect(html).toHaveAttribute("data-theme", "dark");
  });

  it("restores a stored System choice on load", () => {
    mockSystemScheme(false);
    localStorage.setItem("dd-theme", "system");
    renderPanel();
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    expect(html).toHaveAttribute("data-theme", "light");
  });

  it("tells the desktop app which theme source to use", () => {
    const { bridge } = installFakeBridge();
    renderPanel();
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(bridge.app.setThemeSource).toHaveBeenLastCalledWith("light");
    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(bridge.app.setThemeSource).toHaveBeenLastCalledWith("system");
  });
});
