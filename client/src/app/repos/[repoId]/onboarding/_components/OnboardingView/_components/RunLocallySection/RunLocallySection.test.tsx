import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { RunLocallySection } from "./RunLocallySection";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>{ui}</NextIntlClientProvider>);
}

describe("RunLocallySection (C-AC-13, C-AC-14, C-AC-15)", () => {
  it("renders an explicit empty state when no commands were found", () => {
    renderWithIntl(<RunLocallySection commands={[]} />);
    expect(screen.getByText(messages.sections.runLocally.empty)).toBeInTheDocument();
  });

  it("renders numbered monospace rows and copies EXACTLY that command's text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderWithIntl(
      <RunLocallySection
        commands={[
          { order: 1, command: "cp .env.example .env", source: "env_example" },
          { order: 2, command: "npm run dev", source: "package_json" },
        ]}
      />,
    );

    expect(screen.getByText("cp .env.example .env")).toBeInTheDocument();
    expect(screen.getByText("npm run dev")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Copy "npm run dev"'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("npm run dev"));
    expect(writeText).not.toHaveBeenCalledWith("cp .env.example .env");
  });
});
