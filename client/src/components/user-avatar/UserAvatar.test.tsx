import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { UserAvatar } from "./UserAvatar";
import { avatarHue, initials } from "./helpers";

afterEach(cleanup);

describe("UserAvatar", () => {
  it("falls back to initials without an image", () => {
    render(<UserAvatar name="Ada Lovelace" />);
    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveTextContent("AL");
  });

  it("picks a stable hue per name", () => {
    expect(avatarHue("octocat")).toBe(avatarHue("octocat"));
    expect(initials("devdigest-bot")).toBe("DB");
  });
});
