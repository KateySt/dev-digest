/* App shell chrome: sidebar nav, repo switcher, command palette, shortcuts help. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { IntlWrapper } from "@/test/intl";
import { openMenu } from "@/test/radix";
import { SidebarProvider } from "@/components/ui/sidebar";
import shell from "../../../messages/en/shell.json";
import { AppSidebar } from "./AppSidebar";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsHelp } from "./ShortcutsHelp";
import type { Command, ShellContext } from "./types";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) =>
  render(
    <IntlWrapper messages={{ shell }}>
      <SidebarProvider>{ui}</SidebarProvider>
    </IntlWrapper>,
  );

function makeCtx(overrides: Partial<ShellContext> = {}): ShellContext {
  const repos = [
    { id: "r1", full_name: "acme/api", default_branch: "main", synced: true },
    { id: "r2", full_name: "acme/web", default_branch: "dev", synced: false },
  ];
  return {
    activeKey: "pulls",
    repoId: "r1",
    repos,
    activeRepo: repos[0]!,
    theme: "dark",
    onToggleTheme: vi.fn(),
    onOpenCommandPalette: vi.fn(),
    onSelectRepo: vi.fn(),
    onAddRepo: vi.fn(),
    onRemoveRepo: vi.fn(),
    prCount: 3,
    notifications: null,
    account: null,
    desktop: false,
    macTrafficLights: false,
    ...overrides,
  };
}

describe("AppSidebar", () => {
  it("renders translated groups and links with the repo filled in", () => {
    wrap(<AppSidebar ctx={makeCtx()} />);
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pull Requests/ })).toHaveAttribute("href", "/repos/r1/pulls");
    expect(screen.getByRole("link", { name: "Skills" })).toHaveAttribute("href", "/skills");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings/api-keys");
  });

  it("marks the active item and shows the needs-review badge", () => {
    wrap(<AppSidebar ctx={makeCtx({ activeKey: "skills" })} />);
    expect(screen.getByRole("link", { name: "Skills" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: /Pull Requests/ })).toHaveAttribute("data-active", "false");
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("RepoSwitcher", () => {
  it("shows the active repo and switches, adds and removes repos", async () => {
    const ctx = makeCtx();
    wrap(<AppSidebar ctx={ctx} />);
    const trigger = screen.getByRole("button", { name: "Switch repository" });
    expect(trigger).toHaveTextContent("acme/api");
    expect(trigger).toHaveTextContent("main · synced");

    openMenu(trigger);
    fireEvent.click(await screen.findByRole("menuitem", { name: /acme\/web/ }));
    expect(ctx.onSelectRepo).toHaveBeenCalledWith("r2");

    openMenu(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "Remove acme/web" }));
    expect(ctx.onRemoveRepo).toHaveBeenCalledWith("r2");
    expect(ctx.onSelectRepo).toHaveBeenCalledTimes(1);

    // Removing keeps the menu open (the app asks for confirmation next).
    fireEvent.click(await screen.findByRole("menuitem", { name: "Add repository…" }));
    expect(ctx.onAddRepo).toHaveBeenCalledOnce();
  });

  it("prompts to add a repo when none is active", () => {
    wrap(<AppSidebar ctx={makeCtx({ repos: [], activeRepo: null })} />);
    const trigger = screen.getByRole("button", { name: "Switch repository" });
    expect(trigger).toHaveTextContent("No repo selected");
    expect(trigger).toHaveTextContent("Add a repo to begin");
  });
});

describe("CommandPalette", () => {
  const commands = (run = vi.fn()): Command[] => [
    { id: "skills", label: "Go to Skills", group: "Skills lab", icon: "Sparkles", run },
    { id: "theme", label: "Switch to light theme", group: "Appearance", run: vi.fn() },
  ];

  it("filters commands and runs the chosen one", () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(
      <IntlWrapper messages={{ shell }}>
        <CommandPalette open commands={commands(run)} onClose={onClose} />
      </IntlWrapper>,
    );
    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    fireEvent.change(within(dialog).getByPlaceholderText("Type a command or search…"), { target: { value: "skills" } });
    expect(within(dialog).queryByText("Switch to light theme")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("Go to Skills"));
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("says so when nothing matches", () => {
    render(
      <IntlWrapper messages={{ shell }}>
        <CommandPalette open commands={commands()} onClose={vi.fn()} />
      </IntlWrapper>,
    );
    fireEvent.change(screen.getByPlaceholderText("Type a command or search…"), { target: { value: "zzz" } });
    expect(screen.getByText("No commands match.")).toBeInTheDocument();
  });
});

describe("ShortcutsHelp", () => {
  it("lists shortcuts by group with translated labels", () => {
    render(
      <IntlWrapper messages={{ shell }}>
        <ShortcutsHelp open onClose={vi.fn()} />
      </IntlWrapper>,
    );
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("Navigation")).toBeInTheDocument();
    expect(within(dialog).getByText("Go to Pull Requests")).toBeInTheDocument();
    expect(within(dialog).getByText("Open command palette")).toBeInTheDocument();
  });
});
