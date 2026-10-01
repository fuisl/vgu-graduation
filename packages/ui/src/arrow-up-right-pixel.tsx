const PIXELS: ReadonlyArray<readonly [number, number]> = [
  [2, 0], [3, 0], [4, 0], [5, 0], [6, 0],
  [6, 1], [5, 1], [6, 2], [4, 2], [6, 3], [3, 3], [6, 4], [2, 4], [1, 5], [0, 6],
];

/** Pixel-style up-right arrow on a 7x7 grid. Decorative: always aria-hidden. */
export function ArrowUpRightPixel() {
  return (
    <svg className="brand-arrow" viewBox="0 0 7 7" fill="currentColor" aria-hidden="true" focusable="false">
      {PIXELS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />)}
    </svg>
  );
}
