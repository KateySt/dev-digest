import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderApp } from "@/test/eval-utils";
import { UsedSkillGroup } from "./UsedSkillGroup";

afterEach(cleanup);

describe("UsedSkillGroup", () => {
  it("links to the skill and labels a project-scoped skill", () => {
    renderApp(
      <UsedSkillGroup skill={{ id: "s1", name: "api-errors", repo_id: "r1" }} items={[]} renderItem={() => null} />,
    );
    expect(screen.getByRole("link", { name: "Open skill api-errors" }).getAttribute("href")).toBe("/skills?skill=s1");
    expect(screen.getByText("Project")).toBeTruthy();
    expect(screen.getByText("0 conventions")).toBeTruthy();
  });

  it("labels a global skill", () => {
    renderApp(<UsedSkillGroup skill={{ id: "s2", name: "naming", repo_id: null }} items={[]} renderItem={() => null} />);
    expect(screen.getByText("Global")).toBeTruthy();
  });
});
