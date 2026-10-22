
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { CodeField } from "./CodeField";
import { estimateTokens } from "./helpers";

afterEach(cleanup);

describe("estimateTokens", () => {
  it("is ~4 chars per token and 0 for blank text", () => {
    expect(estimateTokens("   ")).toBe(0);
    expect(estimateTokens("12345678")).toBe(2);
    expect(estimateTokens("123456789")).toBe(3);
  });
});

describe("CodeField", () => {
  it("shows the file header with unsaved state and token count", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <CodeField value="12345678" filename="SKILL.md" dirty />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("SKILL.md")).toBeInTheDocument();
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("2 tokens")).toBeInTheDocument();
  });
});
