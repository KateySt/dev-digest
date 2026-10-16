/* Settings → Appearance: each choice is a radio that updates <html> attributes and persists. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/settings.json";
import { ThemeProvider } from "@/lib/contexts";
import { SettingsAppearance } from "./SettingsAppearance";

const html = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  for (const attr of ["data-theme", "data-palette", "data-accent"]) html.removeAttribute(attr);
});
afterEach(cleanup);

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
});
