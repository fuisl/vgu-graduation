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
    </div>
  );
}
