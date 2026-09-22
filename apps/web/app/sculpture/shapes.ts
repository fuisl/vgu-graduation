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
  if (i % 10 < 2) {
    // Axes anchored to the surface's true bounding corner (x min, z max, y below the lowest point)
    // and reaching past its highest point, so the frame actually encloses the terrain.
    const origin: Point = [-1.5, -0.62, 1.1];
    const ends: Point[] = [[1.5, -0.62, 1.1], [-1.5, 1.24, 1.1], [-1.5, -0.62, -1.1]];
    const axis = i % 3;
    const point = line(origin, ends[axis], random());
    return [point[0] + between(random, -0.012, 0.012), point[1] + between(random, -0.012, 0.012), point[2] + between(random, -0.012, 0.012)];
  }
  if (i % 10 < 4) {
    const t = random();
    const x = 1.22 - 1.55 * t;
    const z = -0.95 + 0.68 * t + 0.15 * Math.sin(t * 8);
    const y = 0.38 * (x * x + z * z) + 0.25 * Math.sin(x * 3) * Math.cos(z * 3) - 0.38;
    return [x, y + 0.055, z];
  }
  const x = between(random, -1.5, 1.5);
  const z = between(random, -1.1, 1.1);
  const y = 0.38 * (x * x + z * z) + 0.25 * Math.sin(x * 3) * Math.cos(z * 3) - 0.38;
  return [x, y, z];
}

// A roughly-spherical 3D node network: isotropic, so unlike a flat diagram it never
// reads as a thin sliver from any rotation angle.
function fibonacciSphere(count: number, radius: number): Point[] {
  const points: Point[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < count; k++) {
    const y = 1 - (k / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * k;
    points.push([Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius]);
  }
  return points;
}

const NN_NODES: Point[] = [...fibonacciSphere(64, 1.05), ...fibonacciSphere(28, 0.62), [0, 0, 0]];

function nodeDist2(a: Point, b: Point) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

const NN_EDGES: [number, number][] = (() => {
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (let a = 0; a < NN_NODES.length; a++) {
    const ranked = NN_NODES
      .map((p, b): [number, number] => [nodeDist2(NN_NODES[a], p), b])
      .filter(([, b]) => b !== a)
      .sort((x, y) => x[0] - y[0]);
    for (let k = 0; k < 4; k++) {
      const b = ranked[k][1];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(a < b ? [a, b] : [b, a]);
    }
  }
  return edges;
})();

function cnn(i: number, random: Rng): Point {
  const kind = i % 10;
  // Edges: the connective mesh between nodes, thickened by a slight radial jitter for visible strands.
  if (kind < 7) {
    const [a, b] = NN_EDGES[Math.floor(random() * NN_EDGES.length)];
    const t = random();
    const point = line(NN_NODES[a], NN_NODES[b], t);
    const wobble = Math.sin(t * Math.PI) * 0.012;
    return [point[0] + between(random, -wobble, wobble), point[1] + between(random, -wobble, wobble), point[2] + between(random, -wobble, wobble)];
  }
  // Nodes: small filled spheres at every network vertex, brighter than the strands.
  const node = NN_NODES[Math.floor(random() * NN_NODES.length)];
  const theta = random() * Math.PI * 2;
  const phi = random() * Math.PI;
  const radius = 0.07;
  return [
    node[0] + Math.sin(phi) * Math.cos(theta) * radius,
    node[1] + Math.cos(phi) * radius,
    node[2] + Math.sin(phi) * Math.sin(theta) * radius,
  ];
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

// A chunky extruded lightning bolt: symbolic of electrical/electronics work, and unlike a
// flat PCB it keeps real volume (outline, depth walls, filled caps, interior core) so it
// stays legible from every angle of a full rotation instead of vanishing edge-on.
const BOLT_POLY: [number, number][] = [
  [0.18, 1.25],
  [-0.42, 0.06],
  [0.0, 0.06],
  [-0.18, -1.25],
  [0.42, -0.06],
  [0.0, -0.06],
];
const BOLT_DEPTH = 0.3;
const BOLT_LAYERS = [-0.3, -0.15, 0, 0.15, 0.3];

function boltInPolygon(x: number, y: number) {
  let inside = false;
  for (let a = 0, b = BOLT_POLY.length - 1; a < BOLT_POLY.length; b = a++) {
    const [xa, ya] = BOLT_POLY[a];
    const [xb, yb] = BOLT_POLY[b];
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}

function boltFillPoint(random: Rng): [number, number] {
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = between(random, -0.42, 0.42);
    const y = between(random, -1.25, 1.25);
    if (boltInPolygon(x, y)) return [x, y];
  }
  return [0, 0];
}

function bolt(i: number, random: Rng): Point {
  const kind = i % 10;
  const edge = Math.floor(random() * BOLT_POLY.length);
  const next = (edge + 1) % BOLT_POLY.length;
  const [xa, ya] = BOLT_POLY[edge];
  const [xb, yb] = BOLT_POLY[next];
  const t = random();
  const x = xa + (xb - xa) * t;
  const y = ya + (yb - ya) * t;
  // Outline strokes repeated across several depths, giving the extrusion visible ridge lines.
  if (kind < 4) return [x, y, BOLT_LAYERS[Math.floor(random() * BOLT_LAYERS.length)]];
  // Depth walls: verticals joining the same outline position across the full extrusion.
  if (kind < 6) return [x, y, between(random, -BOLT_DEPTH, BOLT_DEPTH)];
  // Front and back caps, filled solid so the bolt reads as a slab rather than a hollow cage.
  if (kind < 8) {
    const [fx, fy] = boltFillPoint(random);
    return [fx, fy, random() < 0.5 ? BOLT_DEPTH : -BOLT_DEPTH];
  }
  // Interior core fill across every layer, for density when the bolt is seen edge-on.
  const [fx, fy] = boltFillPoint(random);
  return [fx, fy, BOLT_LAYERS[Math.floor(random() * BOLT_LAYERS.length)]];
}

function pipeline(i: number, random: Rng): Point {
  const kind = i % 10;
  if (kind < 4) {
    // Two database drums, with visible top and bottom ellipses and stacked bands.
    const center = kind < 2 ? -1.05 : 1.05;
    const theta = random() * Math.PI * 2;
    const radius = 0.31;
    const band = random();
    const y = band < 0.43 ? 0.42 : band < 0.86 ? -0.42 : band < 0.94 ? 0 : between(random, -0.42, 0.42);
    return [center + Math.cos(theta) * radius, y, Math.sin(theta) * radius];
  }
  if (kind < 6) {
    // Central transform stage: a box with depth, rather than a third storage node.
    const face = Math.floor(random() * 3);
    const p: Point = [between(random, -0.31, 0.31), between(random, -0.34, 0.34), between(random, -0.31, 0.31)];
    p[face] = (random() < 0.5 ? -1 : 1) * (face === 1 ? 0.34 : 0.31);
    return p;
  }
  const side = random() < 0.5 ? -1 : 1;
  const start: Point = [side * 0.31, 0, 0];
  const end: Point = [side * 0.76, 0, 0];
  const t = random();
  const p = line(start, end, t);
  if (kind < 8) {
    const theta = random() * Math.PI * 2;
    return [p[0], p[1] + Math.sin(theta) * 0.075, p[2] + Math.cos(theta) * 0.075];
  }
  // Two chevrons point from source storage through transform to sink storage.
  const arrowX = side * 0.52;
  const branch = random() < 0.5 ? -1 : 1;
  const progress = random();
  return [arrowX - 0.1 + progress * 0.18, branch * (0.13 - progress * 0.13), 0.2];
}

function quant(i: number, random: Rng): Point {
  const candles = [
    [-0.55, -0.22, -0.08, -0.74], [-0.16, 0.12, 0.3, -0.35],
    [0.1, -0.14, 0.34, -0.32], [-0.08, 0.3, 0.53, -0.27],
    [0.25, 0.54, 0.75, 0.05], [0.58, 0.32, 0.78, 0.13],
    [0.39, 0.77, 1.02, 0.2],
  ];
  const kind = i % 10;
  if (kind < 8) {
    const index = Math.floor(random() * candles.length);
    const x = -1.26 + index * 0.42;
    const [open, close, high, low] = candles[index];
    if (kind >= 5) return [x + between(random, -0.012, 0.012), between(random, low, high), 0.48];
    const face = Math.floor(random() * 4);
    const px = face < 2 ? between(random, -0.105, 0.105) : (face === 2 ? -0.105 : 0.105);
    const pz = face < 2 ? (face === 0 ? 0.31 : 0.52) : between(random, 0.31, 0.52);
    return [x + px, between(random, Math.min(open, close), Math.max(open, close)), pz];
  }
  if (kind === 8) {
    const side = random() < 0.5 ? -1 : 1;
    const depth = between(random, 0.12, 1.2);
    const level = Math.floor(random() * 6);
    return [side * depth, -0.94 + level * 0.055, between(random, -0.76, -0.3)];
  }
  const t = random();
  return [-1.36 + 2.72 * t, -0.72 + 0.18 * t, -0.68];
}

type ShapeDef = {
  name: string;
  make: (i: number, random: Rng) => Point;
  shade?: (i: number, light: number) => number;
};

const SHAPE_DEFS: ShapeDef[] = [
  {
    name: "GRADIENT DESCENT",
    make: landscape,
    shade: (i, light) => (i % 10 < 2 ? 1 : i % 10 < 4 ? 0.9 : light),
  },
  {
    name: "NEURAL NETWORKS",
    make: cnn,
    shade: (i, light) => (i % 10 >= 7 ? 0.95 : light * 0.82),
  },
  { name: "SOFTWARE ENGINEERING", make: laptop },
  {
    name: "ELECTRICAL ENGINEERING",
    make: bolt,
    shade: (i, light) => {
      const kind = i % 10;
      if (kind < 4) return Math.max(light, 0.78);
      if (kind < 6) return Math.max(light, 0.6);
      return light;
    },
  },
  {
    name: "DATA ENGINEERING",
    make: pipeline,
    shade: (i, light) => (i % 10 >= 6 ? Math.max(light, 0.68) : light),
  },
  {
    name: "QUANTITATIVE FINANCE",
    make: quant,
    shade: (i, light) => {
      const kind = i % 10;
      if (kind >= 5 && kind < 8) return 0.94;
      if (kind === 8) return light * 0.45;
      return light;
    },
  },
];

export const SHAPE_NAMES = SHAPE_DEFS.map((def) => def.name) as readonly string[];

export const SHAPES = SHAPE_DEFS.map((def, index) => {
  const random = rng(2600 + index * 709);
  const points = new Float32Array(POINT_COUNT * 3);
  for (let i = 0; i < POINT_COUNT; i++) points.set(def.make(i, random), i * 3);
  return points;
});

export const SHADES = SHAPE_DEFS.map((def, shapeIndex) => {
  const points = SHAPES[shapeIndex];
  const shades = new Float32Array(POINT_COUNT * 3);
  for (let i = 0; i < POINT_COUNT; i++) {
    const offset = i * 3;
    const x = points[offset];
    const y = points[offset + 1];
    const z = points[offset + 2];
    let light: number;
    if (def.name === "GRADIENT DESCENT") {
      const dx = 0.76 * x + 0.75 * Math.cos(3 * x) * Math.cos(3 * z);
      const dz = 0.76 * z - 0.75 * Math.sin(3 * x) * Math.sin(3 * z);
      const facing = (0.7 + 0.62 * dx - 0.48 * dz) / Math.sqrt(1 + dx * dx + dz * dz);
      const elevation = Math.max(0, Math.min(1, (y + 0.45) / 1.2));
      light = (0.12 + 0.88 * Math.max(0, facing)) * (0.38 + 0.62 * elevation);
    } else {
      // A fixed upper-left light gives each rotating structure bright and shaded sides.
      light = 0.48 - x * 0.29 + y * 0.26 + z * 0.25;
    }
    if (def.shade) light = def.shade(i, light);
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
