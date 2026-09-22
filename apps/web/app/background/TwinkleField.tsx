// Sparse, low-density sparkle scattered across the grid's lit region. Positions are
// generated once from a small seeded PRNG (same technique as the sculpture's point clouds
// and the logo's ASCII sampling) so the layout is stable across server and client renders
// with no hydration mismatch, rather than actual per-render randomness.
function rng(seed: number) {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const DOT_COUNT = 26;
const random = rng(7919);
const DOTS = Array.from({ length: DOT_COUNT }, () => ({
  left: 16 + random() * 68,
  top: 12 + random() * 66,
  delay: random() * 8,
  duration: 3.2 + random() * 3.2,
}));

// A few grid coordinates carry a quiet ASCII signal. Keep the middle clear for
// the sculpture and copy, and use fixed positions for stable server rendering.
const SIGNALS = [
  { left: 12, top: 25, glyph: "+", delay: 0 },
  { left: 20, top: 72, glyph: ":", delay: 4 },
  { left: 81, top: 19, glyph: "*", delay: 8 },
  { left: 89, top: 63, glyph: "+", delay: 12 },
  { left: 72, top: 83, glyph: ".", delay: 16 },
];

export function TwinkleField() {
  return (
    <div className="landing-twinkle" aria-hidden="true">
      {DOTS.map((dot, i) => (
        <span
          key={i}
          className="landing-twinkle-dot"
          style={{
            left: `${dot.left}%`,
            top: `${dot.top}%`,
            animationDelay: `${dot.delay}s`,
            animationDuration: `${dot.duration}s`,
          }}
        />
      ))}
      {SIGNALS.map((signal, i) => (
        <span key={`signal-${i}`} className="landing-grid-signal" style={{ left: `${signal.left}%`, top: `${signal.top}%`, animationDelay: `${signal.delay}s` }}>
          {signal.glyph}
        </span>
      ))}
    </div>
  );
}
