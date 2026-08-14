/**
 * VeronicaPrism — SVG icon for the Veronica persona.
 *
 * A heavy leaded-crystal triangular prism with a "V" forged into its
 * core geometry.  Light enters, refracts through the interior fold,
 * and splits into violet/indigo (left) and orange/crimson (right).
 *
 * Props match <svg> so callers can set size, className, style, etc.
 */
export default function VeronicaPrism(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 100 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        {/* Violet / Indigo gradient — left side */}
        <linearGradient id="violet-left" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>

        {/* Orange / Crimson gradient — right side */}
        <linearGradient id="orange-right" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="50%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>

        {/* Glow behind the prism */}
        <radialGradient id="prism-glow" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.12} />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
        </radialGradient>

        {/* V interior — left glow */}
        <linearGradient id="v-glow-left" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c4b5fd" stopOpacity={0.45} />
          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.1} />
        </linearGradient>

        {/* V interior — right glow */}
        <linearGradient id="v-glow-right" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fdba74" stopOpacity={0.45} />
          <stop offset="100%" stopColor="#ef4444" stopOpacity={0.1} />
        </linearGradient>

        {/* Edge highlight filter */}
        <filter id="crystal-edge">
          <feDropShadow dx={0} dy={1} stdDeviation={1} floodColor="#000" floodOpacity={0.3} />
        </filter>
      </defs>

      {/* Ambient glow behind the prism */}
      <ellipse cx={50} cy={55} rx={38} ry={32} fill="url(#prism-glow)" />

      {/* ── Crystal body ── */}

      {/* Left facet — violet / indigo */}
      <polygon
        points="50,4 50,98 12,98"
        fill="url(#violet-left)"
        opacity={0.92}
      />

      {/* Right facet — orange / crimson */}
      <polygon
        points="50,4 50,98 88,98"
        fill="url(#orange-right)"
        opacity={0.92}
      />

      {/* ── Interior V fold ── */}

      {/* V left facet glow */}
      <polygon
        points="50,4 36,48 50,66"
        fill="url(#v-glow-left)"
      />

      {/* V right facet glow */}
      <polygon
        points="50,4 64,48 50,66"
        fill="url(#v-glow-right)"
      />

      {/* V outline — the architectural fold */}
      <path
        d="M34 48 L50 66 L66 48"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* V — left arm fill (lower triangle) */}
      <polygon
        points="34,48 50,66 50,98 12,98"
        fill="url(#violet-left)"
        opacity={0.25}
      />

      {/* V — right arm fill (lower triangle) */}
      <polygon
        points="66,48 50,66 50,98 88,98"
        fill="url(#orange-right)"
        opacity={0.25}
      />

      {/* ── Crystal edge highlights ── */}

      {/* Center seam */}
      <line
        x1={50} y1={4} x2={50} y2={98}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={1.2}
      />

      {/* Left bevel */}
      <path
        d="M50,4 L12,98"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={1}
      />

      {/* Right bevel */}
      <path
        d="M50,4 L88,98"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={1}
      />

      {/* ── Top light glint ── */}
      <circle cx={50} cy={10} r={2.5} fill="rgba(255,255,255,0.5)" />
      <circle cx={50} cy={10} r={5} fill="rgba(255,255,255,0.08)" />

      {/* ── Obsidian base ── */}
      <rect x={6} y={98} width={88} height={8} rx={3} fill="#0a0a0f" />
      <rect
        x={6} y={98} width={88} height={1.5}
        rx={0.5}
        fill="rgba(255,255,255,0.06)"
      />

      {/* Base shadow */}
      <ellipse
        cx={50} cy={103} rx={44} ry={3}
        fill="rgba(0,0,0,0.35)"
      />
    </svg>
  );
}
