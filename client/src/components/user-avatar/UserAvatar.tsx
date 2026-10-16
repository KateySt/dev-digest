"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { avatarHue, initials } from "./helpers";

/** Person avatar: GitHub image when available, otherwise coloured initials.
 *  A plain <img> (not Radix Avatar, which only mounts the image after it has
 *  loaded) so the image is in the DOM immediately. `size` is a runtime prop
 *  (px), passed as the `--avatar-size` variable. */
export function UserAvatar({
  name,
  avatarUrl,
  size = 22,
  className,
}: {
  name: string;
  /** GitHub avatar image URL; falls back to initials when missing or failing to load. */
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const sizeVar = { "--avatar-size": `${size}px` } as React.CSSProperties;

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className={cn("size-(--avatar-size) shrink-0 rounded-full object-cover", className)}
        style={sizeVar}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-grid size-(--avatar-size) shrink-0 place-items-center rounded-full border text-[calc(var(--avatar-size)*0.4)] font-semibold",
        avatarHue(name),
        className,
      )}
      style={sizeVar}
    >
      {initials(name)}
    </span>
  );
}
