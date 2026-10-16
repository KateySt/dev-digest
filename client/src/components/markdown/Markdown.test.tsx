import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";

afterEach(cleanup);

describe("Markdown", () => {
  it("renders nothing for empty input", () => {
    const { container } = render(<Markdown>{""}</Markdown>);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders GFM inline elements inside the .dd-md wrapper", () => {
    const { container } = render(<Markdown>{"**bold** `code` [link](https://x.dev)"}</Markdown>);
    expect(container.firstChild).toHaveClass("dd-md");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute("href", "https://x.dev");
  });
});
