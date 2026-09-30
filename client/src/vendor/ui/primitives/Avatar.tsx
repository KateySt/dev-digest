"use client";

import React from "react";

export function Avatar({
  name,
  avatarUrl,
  size = 22,
  color,
}: {
  name: string;
  /** GitHub avatar image URL; falls back to initials when missing or failing to load. */
  avatarUrl?: string | null;
  size?: number;
  color?: string;
}) {
  const [imgFailed, setImgFailed] = React.useState(false);

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: 99,
          flexShrink: 0,
          objectFit: "cover",
        }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  const initials = name
    .split(/[\s-]/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const hues = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];
  const hue = color || hues[name.charCodeAt(0) % hues.length]!;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        flexShrink: 0,
        display: "inline-grid",
        placeItems: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        background: hue + "22",
        color: hue,
        border: "1px solid " + hue + "44",
      }}
    >
      {initials}
    </span>
  );
}
