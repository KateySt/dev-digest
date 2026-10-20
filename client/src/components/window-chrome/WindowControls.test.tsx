/* WindowControls — desktop-only caption buttons driving the preload bridge. */
import type React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { WindowControls } from "./WindowControls";
import { installFakeBridge, removeFakeBridge } from "@/test/fake-desktop-bridge";
import { IntlWrapper } from "@/test/intl";
import shell from "../../../messages/en/shell.json";

const render = (ui: React.ReactElement) =>
  rtlRender(ui, { wrapper: ({ children }) => <IntlWrapper messages={{ shell }}>{children}</IntlWrapper> });

afterEach(() => {
  cleanup();
  removeFakeBridge();
});

describe("WindowControls", () => {
  it("renders nothing in a browser (no bridge)", () => {
    const { container } = render(<WindowControls />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on macOS, which keeps its native traffic lights", () => {
    installFakeBridge("darwin");
    const { container } = render(<WindowControls />);
    expect(container).toBeEmptyDOMElement();
  });

  it("minimizes, maximizes and closes the window through the bridge", () => {
    const { bridge } = installFakeBridge();
    render(<WindowControls />);
    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    expect(bridge.window.minimize).toHaveBeenCalledOnce();
    expect(bridge.window.toggleMaximize).toHaveBeenCalledOnce();
    expect(bridge.window.close).toHaveBeenCalledOnce();
  });

  it("swaps Maximize for Restore when the window gets maximized", async () => {
    const { emitMaximized } = installFakeBridge();
    render(<WindowControls />);
    await screen.findByRole("button", { name: "Maximize window" });
    act(() => emitMaximized(true));
    expect(screen.getByRole("button", { name: "Restore window" })).toBeInTheDocument();
  });
});
