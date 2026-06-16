// Minimal inline SVG sparkline — no client JS, no external lib.
// Renders 7 data points (or N) as a smooth area + line. Used in the
// premium KPI strip on /partner-portal to show 7-day trends.
//
// Pure presentational: takes a points array, optional baseline, optional
// tone. Renders nothing if the array is empty or all-zeros (avoids
// drawing a flat line that looks like a bug).

type SparklineProps = {
  /** Data points (oldest → newest). Empty array renders nothing. */
  points: number[];
  /** Visual width in px. Default 64. */
  width?: number;
  /** Visual height in px. Default 20. */
  height?: number;
  /** Tone (Tailwind text color class). Default `text-purple-500`. */
  tone?: string;
  /** Optional ARIA label for screen readers. */
  label?: string;
};

export function Sparkline({
  points,
  width = 64,
  height = 20,
  tone = 'text-purple-500',
  label,
}: SparklineProps) {
  if (!points.length) return null;
  // If all values are identical we still want to render — but as a
  // straight middle line, not a degenerate min=max=0 division.
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : 0;

  const coords = points.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });

  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={tone}
      preserveAspectRatio="none"
    >
      <path d={areaPath} fill="currentColor" opacity={0.12} />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
