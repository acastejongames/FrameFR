interface AircraftGlyphProps {
  /** True track in degrees. */
  heading: number
  color: string
  size?: number
  className?: string
}

/** Top-down aircraft silhouette pointing north, rotated to the track. */
const PLANE_PATH =
  'M12 2c.66 0 1.24.45 1.4 1.09l.98 4.02 3.1 1.44 2.52 1.17v2.06l-5.62 1.2-.46 3.02 2.9 2.2v1.62L12 19.4l-4.82 1.42v-1.62l2.9-2.2-.46-3.02L4 11.78V9.72l2.52-1.17 3.1-1.44.98-4.02C10.76 2.45 11.34 2 12 2z'

export function AircraftGlyph({ heading, color, size = 14, className }: AircraftGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={{ color, transform: `rotate(${heading}deg)`, flexShrink: 0 }}
    >
      <path d={PLANE_PATH} fill="currentColor" />
    </svg>
  )
}
