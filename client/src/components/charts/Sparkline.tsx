

export function Sparkline({
  data,
  color = "var(--accent)",
  w = 80,
  h = 24,
}: {
  data: number[];
  /** Stroke colour (any CSS colour, applied as an SVG attribute). */
  color?: string;
  w?: number;
  h?: number;
}) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  // A single point has no x-range to span (0/0 -> NaN): centre it so it renders as a dot.
  const pts = data.map((v, i) => [data.length > 1 ? (i / (data.length - 1)) * w : w / 2, h - ((v - min) / span) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0]!.toFixed(1) + "," + p[1]!.toFixed(1)).join(" ");
  const last = pts[pts.length - 1]!;
  return (
    <svg width={w} height={h} className="block overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </svg>
  );
}
