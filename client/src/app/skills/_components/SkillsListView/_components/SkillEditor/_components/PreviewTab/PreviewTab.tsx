"use client";

import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

/** Preview tab — the skill's body rendered as an agent would receive it. */
export function PreviewTab({ skill }: { skill: Skill }) {
  return <Markdown>{skill.body}</Markdown>;
}
