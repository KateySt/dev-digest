"use client";

import React from "react";

/** Section heading + lede used across the settings sections. */
export function SectionTitle({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h2 className="mb-1.25 text-2xl font-bold">{title}</h2>
      <p className="mb-6 text-base text-muted-foreground">{body}</p>
    </>
  );
}
