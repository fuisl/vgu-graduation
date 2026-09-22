export const SHAPE_NAMES = [
  "GRADIENT DESCENT",
  "SOFTWARE ENGINEERING",
  "DATA ENGINEERING",
  "COMMUNICATIONS",
  "QUANTITATIVE FINANCE",
] as const;

export const POINT_COUNT = 5200;
export const HOLD_SECONDS = 5;
export const MORPH_SECONDS = 1.5;

type Point = [number, number, number];
type Rng = () => number;

function rng(seed: number): Rng {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const between = (random: Rng, min: number, max: number) => min + random() * (max - min);
const line = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function landscape(i: number, random: Rng): Point {
  if (i % 6 === 0) {
    const t = random();
    const x = 1.22 - 1.55 * t;
    const z = -0.95 + 0.68 * t + 0.15 * Math.sin(t * 8);
    const y = 0.38 * (x * x + z * z) + 0.25 * Math.sin(x * 3) * Math.cos(z * 3) - 0.58;
    return [x, y + 0.055, z];
  }
  const x = between(random, -1.5, 1.5);
  const z = between(random, -1.1, 1.1);
  const y = 0.38 * (x * x + z * z) + 0.25 * Math.sin(x * 3) * Math.cos(z * 3) - 0.58;
  return [x, y, z];
}

function laptop(i: number, random: Rng): Point {
  const x = between(random, -1.2, 1.2);
  const z = between(random, -0.9, 0.9);
  if (i % 10 < 5) {
    // Upright screen, including its bright perimeter and a sparse terminal field.
    const edge = i % 5 < 2;
    const sx = edge && random() < 0.5 ? (random() < 0.5 ? -1.08 : 1.08) : x * 0.9;
    const sy = edge && random() < 0.5 ? (random() < 0.5 ? -0.12 : 1.42) : between(random, -0.12, 1.42);
    return [sx, sy - 0.3, -0.48 - (sy + 0.12) * 0.16];
  }
  if (i % 10 < 9) return [x, -0.48 + 0.03 * random(), z * 0.55 + 0.18];
  return [x, -0.46, -0.48];
}

function pipeline(i: number, random: Rng): Point {
  const nodes: Point[] = [[-1.25, -0.15, 0], [0, 0.42, 0], [1.25, -0.15, 0]];
  if (i % 5 < 2) {
    const node = nodes[Math.floor(random() * nodes.length)];
    const face = Math.floor(random() * 3);
    const p: Point = [between(random, -0.25, 0.25), between(random, -0.25, 0.25), between(random, -0.25, 0.25)];
    p[face] = (random() < 0.5 ? -1 : 1) * 0.25;
    return [node[0] + p[0], node[1] + p[1], node[2] + p[2]];
  }
  const links: [Point, Point][] = [[nodes[0], nodes[1]], [nodes[1], nodes[2]]];
  const [a, b] = links[Math.floor(random() * links.length)];
  const p = line(a, b, random());
  const theta = random() * Math.PI * 2;
  return [p[0], p[1] + Math.sin(theta) * 0.085, p[2] + Math.cos(theta) * 0.085];
}

function tower(i: number, random: Rng): Point {
  if (i % 10 < 7) {
    const section = Math.floor(random() * 8);
    const t = random();
    const y0 = -1.22 + section * 0.29;
    const y1 = y0 + 0.29;
    const width = (y: number) => 0.58 * (1.2 - (y + 1.22) / 2.7);
    const side = random() < 0.5 ? -1 : 1;
    const diagonal = i % 3 === 0;
    return [side * width(y0 + t * 0.29) * (diagonal ? 1 - 2 * t : 1), y0 + t * (y1 - y0), between(random, -0.035, 0.035)];
  }
  const radius = i % 10 === 7 ? 0.53 : i % 10 === 8 ? 0.82 : 1.1;
  const theta = between(random, -Math.PI * 0.82, Math.PI * 0.82);
  return [Math.sin(theta) * radius, 0.82 + Math.cos(theta) * radius * 0.64, 0.04];
}

function quant(i: number, random: Rng): Point {
  const highs = [0.25, 0.52, 0.41, 0.9, 0.7, 1.08, 0.84, 1.28, 1.11, 1.47, 1.32];
  if (i % 10 < 7) {
    const index = Math.floor(random() * highs.length);
    const x = -1.35 + index * 0.27;
    const bottom = highs[index] - 0.55;
    const top = highs[index] - 0.1;
    const y = i % 3 === 0 ? between(random, bottom - 0.23, top + 0.24) : between(random, bottom, top);
    return [x + (i % 3 === 0 ? 0 : between(random, -0.075, 0.075)), y - 0.48, between(random, -0.09, 0.09)];
  }
  if (i % 10 < 9) {
    const side = random() < 0.5 ? -1 : 1;
    const depth = between(random, 0.2, 1.12);
    const level = Math.floor(random() * 7);
    return [side * depth, -0.9 + level * 0.105, between(random, -0.75, 0.75)];
  }
  const t = random();
  return [-1.4 + 2.8 * t, -0.25 + 0.72 * t + 0.18 * Math.sin(t * 7), 0.2];
}

const makers = [landscape, laptop, pipeline, tower, quant];

export const SHAPES = makers.map((make, index) => {
  const random = rng(2600 + index * 709);
  const points = new Float32Array(POINT_COUNT * 3);
  for (let i = 0; i < POINT_COUNT; i++) points.set(make(i, random), i * 3);
  return points;
});

export const SHADES = SHAPES.map((points, shape) => {
  const shades = new Float32Array(POINT_COUNT * 3);
  for (let i = 0; i < POINT_COUNT; i++) {
    const offset = i * 3;
    const x = points[offset];
    const y = points[offset + 1];
    const z = points[offset + 2];
    let light: number;
    if (shape === 0) {
      const dx = 0.76 * x + 0.75 * Math.cos(3 * x) * Math.cos(3 * z);
      const dz = 0.76 * z - 0.75 * Math.sin(3 * x) * Math.sin(3 * z);
      const facing = (0.7 + 0.62 * dx - 0.48 * dz) / Math.sqrt(1 + dx * dx + dz * dz);
      const elevation = Math.max(0, Math.min(1, (y + 0.45) / 1.2));
      light = (0.12 + 0.88 * Math.max(0, facing)) * (0.38 + 0.62 * elevation);
    } else {
      // A fixed upper-left light gives each rotating structure bright and shaded sides.
      light = 0.48 - x * 0.29 + y * 0.26 + z * 0.25;
    }
    const value = Math.max(0.1, Math.min(1, light));
    shades[offset] = value;
    shades[offset + 1] = value;
    shades[offset + 2] = value;
  }
  return shades;
});

export function sequenceAt(seconds: number) {
  const cycle = HOLD_SECONDS + MORPH_SECONDS;
  const raw = Math.max(0, seconds) / cycle;
  const index = Math.floor(raw) % SHAPES.length;
  const elapsed = (raw - Math.floor(raw)) * cycle;
  const morph = Math.max(0, Math.min(1, (elapsed - HOLD_SECONDS) / MORPH_SECONDS));
  return { index, next: (index + 1) % SHAPES.length, morph };
}
