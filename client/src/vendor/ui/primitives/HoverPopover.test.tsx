import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { HoverPopover } from "./HoverPopover";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HoverPopover", () => {
  it("opens on trigger hover and fires onOpenChange(true)", () => {
    const onOpenChange = vi.fn();
    render(
      <HoverPopover trigger={<span>trigger</span>} onOpenChange={onOpenChange}>
        <div>panel content</div>
      </HoverPopover>,
    );
    expect(screen.queryByText("panel content")).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("trigger"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.getByText("panel content")).toBeInTheDocument();
  });

  it("stays open when the pointer moves from trigger to panel", () => {
    vi.useFakeTimers();
    render(
      <HoverPopover trigger={<span>trigger</span>} closeDelayMs={120}>
        <div>panel content</div>
      </HoverPopover>,
    );
    fireEvent.mouseEnter(screen.getByText("trigger"));
    fireEvent.mouseLeave(screen.getByText("trigger"));
    // Pointer lands on the panel before the close timer fires.
    act(() => {
      vi.advanceTimersByTime(60);
    });
    fireEvent.mouseEnter(screen.getByText("panel content"));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText("panel content")).toBeInTheDocument();
  });

  it("closes after the delay when the pointer leaves both trigger and panel", () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    render(
      <HoverPopover trigger={<span>trigger</span>} closeDelayMs={120} onOpenChange={onOpenChange}>
        <div>panel content</div>
      </HoverPopover>,
    );
    fireEvent.mouseEnter(screen.getByText("trigger"));
    fireEvent.mouseLeave(screen.getByText("trigger"));
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByText("panel content")).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on an outside click", () => {
    render(
      <div>
        <HoverPopover trigger={<span>trigger</span>}>
          <div>panel content</div>
        </HoverPopover>
        <div>outside</div>
      </div>,
    );
    fireEvent.mouseEnter(screen.getByText("trigger"));
    expect(screen.getByText("panel content")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText("outside"));
    expect(screen.queryByText("panel content")).not.toBeInTheDocument();
  });

  it("renders only the trigger when disabled", () => {
    render(
      <HoverPopover trigger={<span>trigger</span>} disabled>
        <div>panel content</div>
      </HoverPopover>,
    );
    fireEvent.mouseEnter(screen.getByText("trigger"));
    expect(screen.queryByText("panel content")).not.toBeInTheDocument();
  });
});
