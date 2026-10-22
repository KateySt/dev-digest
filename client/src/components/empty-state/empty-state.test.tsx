
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IntlWrapper } from "@/test/intl";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renders title, body and a CTA", () => {
    const onCta = vi.fn();
    render(<EmptyState icon="Boxes" title="No agents" body="Create one" cta="New agent" onCta={onCta} />);
    expect(screen.getByText("No agents")).toBeInTheDocument();
    expect(screen.getByText("Create one")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New agent" }));
    expect(onCta).toHaveBeenCalledOnce();
  });

  it("disables the CTA while loading", () => {
    render(<EmptyState title="No agents" cta="New agent" ctaLoading />);
    expect(screen.getByRole("button", { name: "New agent" })).toBeDisabled();
  });
});

describe("ErrorState", () => {
  it("defaults the title and offers Retry", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />, { wrapper: IntlWrapper });
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
