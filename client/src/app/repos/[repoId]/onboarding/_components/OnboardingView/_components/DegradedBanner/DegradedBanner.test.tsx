import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { DegradedBanner } from "./DegradedBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>{ui}</NextIntlClientProvider>);
}

describe("DegradedBanner (C-AC-26)", () => {
  it("renders nothing when neither reason is set", () => {
    const { container } = renderWithIntl(<DegradedBanner indexReason={null} modelReason={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders only the index banner when only index is degraded", () => {
    renderWithIntl(<DegradedBanner indexReason="index_partial" modelReason={null} />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText(messages.degraded.index.title)).toBeInTheDocument();
  });

  it("renders BOTH banners simultaneously when both reasons are set", () => {
    renderWithIntl(<DegradedBanner indexReason="index_partial" modelReason="call_failed" />);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getByText(messages.degraded.index.title)).toBeInTheDocument();
    expect(screen.getByText(messages.degraded.model.title)).toBeInTheDocument();
  });
});
