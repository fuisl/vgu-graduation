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

// A light bulb, standing for innovation/ideas rather than AI specifically: one big, nearly
// full glass globe with a zigzag filament, pinching down through a short neck into a small,
// clearly separate screw base — real volume throughout (glass shell, cone neck, cylinder
// base) so it reads well through a full rotation. An earlier version spent a tenth of its
// points on thin rays off the top; those didn't resolve cleanly through the ASCII sampling
// and read as noise, so they're gone in favor of a fuller, rounder globe.
const BULB_CENTER: Point = [0, 0.5, 0];
const BULB_RADIUS = 0.64;
const BULB_CUTOFF = 2.55; // polar angle where the glass shell ends and the neck begins — close
// to a full sphere (pi), leaving only a small flat underside for the neck to attach to.
const BULB_AURA_SPAN = 0.42; // how far the glow shell extends past the glass
const NECK_TOP_Y = BULB_CENTER[1] + BULB_RADIUS * Math.cos(BULB_CUTOFF);
const NECK_TOP_RADIUS = BULB_RADIUS * Math.sin(BULB_CUTOFF);
const NECK_BOTTOM_Y = -0.22;
const BASE_RADIUS = 0.14;
const BASE_TOP_Y = -0.22;
const BASE_BOTTOM_Y = -0.72;
const FILAMENT: Point[] = [
  [-0.2, 0.08, 0], [0.2, 0.32, 0], [-0.2, 0.56, 0], [0.2, 0.8, 0], [0, 0.98, 0],
];

function bulb(i: number, random: Rng): Point {
  const kind = i % 10;
  // Glass globe: a shell cut off only right at the bottom, where it necks into the base.
  if (kind < 5) {
    const theta = random() * Math.PI * 2;
    const phi = random() * BULB_CUTOFF;
    return [
      BULB_CENTER[0] + BULB_RADIUS * Math.sin(phi) * Math.cos(theta),
      BULB_CENTER[1] + BULB_RADIUS * Math.cos(phi),
      BULB_CENTER[2] + BULB_RADIUS * Math.sin(phi) * Math.sin(theta),
    ];
  }
  // Aura: a sparse glow shell floating outside the glass, thinning out with distance —
  // shaded separately below, purely by how far past the glass each point sits.
  if (kind === 5) {
    const theta = random() * Math.PI * 2;
    const phi = random() * Math.PI;
    const radius = BULB_RADIUS + Math.pow(random(), 1.6) * BULB_AURA_SPAN;
    return [
      BULB_CENTER[0] + radius * Math.sin(phi) * Math.cos(theta),
      BULB_CENTER[1] + radius * Math.cos(phi),
      BULB_CENTER[2] + radius * Math.sin(phi) * Math.sin(theta),
    ];
  }
  // Zigzag filament inside the glass.
  if (kind === 6) {
    const segment = Math.floor(random() * (FILAMENT.length - 1));
    return line(FILAMENT[segment], FILAMENT[segment + 1], random());
  }
  // Short, quickly-tapering neck — the pinch that separates the big globe from the small base.
  if (kind === 7) {
    const t = random();
    const radius = NECK_TOP_RADIUS + (BASE_RADIUS - NECK_TOP_RADIUS) * t;
    const y = NECK_TOP_Y + (NECK_BOTTOM_Y - NECK_TOP_Y) * t;
    const theta = random() * Math.PI * 2;
    return [Math.cos(theta) * radius, y, Math.sin(theta) * radius];
  }
  // Small screw base cylinder.
  if (kind === 8) {
    const theta = random() * Math.PI * 2;
    const y = between(random, BASE_BOTTOM_Y, BASE_TOP_Y);
    return [Math.cos(theta) * BASE_RADIUS, y, Math.sin(theta) * BASE_RADIUS];
  }
  // Thread ridges banding the base.
  const band = Math.floor(random() * 4);
  const y = BASE_TOP_Y - 0.05 + band * -0.15;
  const theta = random() * Math.PI * 2;
  return [Math.cos(theta) * (BASE_RADIUS + 0.03), y, Math.sin(theta) * (BASE_RADIUS + 0.03)];
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

// A triangular lattice cell tower on a square base, with a dish mounted partway up one leg
// and a domed antenna on top ringed by signal arcs — full 3D volume in every direction
// (unlike the flat PCB this shape replaced earlier), so it stays legible through a full
// rotation instead of vanishing edge-on.
const TOWER_BASE_Y = -1.24;
const TOWER_TOP_Y = 0.7;
const TOWER_BASE_RADIUS = 0.5;
const TOWER_TOP_RADIUS = 0.08;
const TOWER_TAPER = (TOWER_BASE_RADIUS - TOWER_TOP_RADIUS) / (TOWER_TOP_Y - TOWER_BASE_Y);
const TOWER_DOME_CENTER: Point = [0, 0.86, 0];
const TOWER_DOME_RADIUS = 0.15;
const TOWER_DISH_LEG = 0;
const TOWER_DISH_HEIGHT = -0.32;
const TOWER_DISH_RADIUS = 0.22;

function towerLegAngle(index: number) {
  return (index * Math.PI * 2) / 3 + Math.PI / 6;
}

function towerLeg(index: number, y: number): Point {
  const radius = TOWER_BASE_RADIUS - (y - TOWER_BASE_Y) * TOWER_TAPER;
  const angle = towerLegAngle(index);
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function tower(i: number, random: Rng): Point {
  const kind = i % 10;
  // Three tapering truss legs.
  if (kind < 4) {
    const leg = Math.floor(random() * 3);
    return towerLeg(leg, between(random, TOWER_BASE_Y, TOWER_TOP_Y));
  }
  // Diagonal cross-bracing between adjacent legs, section by section.
  if (kind === 4) {
    const section = Math.floor(random() * 6);
    const y0 = TOWER_BASE_Y + section * 0.32;
    const y1 = y0 + 0.32;
    const leg = Math.floor(random() * 3);
    return line(towerLeg(leg, y0), towerLeg((leg + 1) % 3, y1), random());
  }
  // Square base plate the legs stand on.
  if (kind === 5) {
    const half = 0.62;
    const edge = Math.floor(random() * 4);
    const t = between(random, -half, half);
    const x = edge === 0 ? half : edge === 1 ? -half : t;
    const z = edge === 2 ? half : edge === 3 ? -half : t;
    return [x, TOWER_BASE_Y - 0.04, z];
  }
  // A dish mounted partway up one leg, facing outward.
  if (kind === 6) {
    const angle = towerLegAngle(TOWER_DISH_LEG);
    const [lx, ly, lz] = towerLeg(TOWER_DISH_LEG, TOWER_DISH_HEIGHT);
    const radial: Point = [Math.cos(angle), 0, Math.sin(angle)];
    const tangent: Point = [-Math.sin(angle), 0, Math.cos(angle)];
    const theta = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * TOWER_DISH_RADIUS;
    return [
      lx + radial[0] * 0.12 + tangent[0] * Math.cos(theta) * r,
      ly + Math.sin(theta) * r,
      lz + radial[2] * 0.12 + tangent[2] * Math.cos(theta) * r,
    ];
  }
  // Collar ring where the legs converge, with a short mast up to the dome.
  if (kind === 7) {
    if (random() < 0.6) {
      const theta = random() * Math.PI * 2;
      return [Math.cos(theta) * 0.1, TOWER_TOP_Y, Math.sin(theta) * 0.1];
    }
    return [between(random, -0.02, 0.02), between(random, TOWER_TOP_Y, TOWER_DOME_CENTER[1] - TOWER_DOME_RADIUS), between(random, -0.02, 0.02)];
  }
  // Domed antenna head.
  if (kind === 8) {
    const theta = random() * Math.PI * 2;
    const phi = random() * Math.PI;
    return [
      TOWER_DOME_CENTER[0] + TOWER_DOME_RADIUS * Math.sin(phi) * Math.cos(theta),
      TOWER_DOME_CENTER[1] + TOWER_DOME_RADIUS * Math.cos(phi),
      TOWER_DOME_CENTER[2] + TOWER_DOME_RADIUS * Math.sin(phi) * Math.sin(theta),
    ];
  }
  // Signal arcs banded around the dome's equator, radiating to whichever side faces the camera.
  const radius = [0.34, 0.56, 0.8][Math.floor(random() * 3)];
  const polar = between(random, Math.PI * 0.28, Math.PI * 0.72);
  const azimuth = random() * Math.PI * 2;
  return [
    TOWER_DOME_CENTER[0] + radius * Math.sin(polar) * Math.cos(azimuth),
    TOWER_DOME_CENTER[1] + radius * Math.cos(polar),
    TOWER_DOME_CENTER[2] + radius * Math.sin(polar) * Math.sin(azimuth),
  ];
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
  // Trend arrow riding above the candle highs, in front of the candles rather than
  // behind them, so the uptrend reads as a deliberate annotation, not a hidden line.
  const start: Point = [-1.32, 0.08, 0.42];
  const end: Point = [1.42, 1.34, 0.42];
  const shaftAngle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  if (random() < 0.62) return line(start, end, random());
  const barbSide = random() < 0.5 ? 1 : -1;
  const barbAngle = shaftAngle + Math.PI + barbSide * 0.5;
  const barbT = random();
  return [end[0] + Math.cos(barbAngle) * 0.26 * barbT, end[1] + Math.sin(barbAngle) * 0.26 * barbT, 0.42];
}

type ShapeDef = {
  name: string;
  make: (i: number, random: Rng) => Point;
  shade?: (i: number, light: number) => number;
};

const SHAPE_DEFS: ShapeDef[] = [
  { name: "SOFTWARE ENGINEERING", make: laptop },
  {
    name: "GRADIENT DESCENT",
    make: landscape,
    shade: (i, light) => (i % 10 < 2 ? 1 : i % 10 < 4 ? 0.9 : light),
  },
  {
    name: "ELECTRICAL ENGINEERING",
    make: tower,
    shade: (i, light) => {
      const kind = i % 10;
      if (kind < 4) return Math.max(light, 0.55);
      if (kind === 6) return Math.max(light, 0.8);
      if (kind === 7) return Math.max(light, 0.7);
      if (kind === 8) return 0.96;
      if (kind === 9) return Math.max(light, 0.82);
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
      if (kind === 9) return 1;
      return light;
    },
  },
  {
    name: "INNOVATION",
    make: bulb,
    shade: (i, light) => {
      const kind = i % 10;
      if (kind === 6) return 1;
      if (kind === 9) return Math.max(light, 0.6);
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
    } else if (def.name === "INNOVATION" && i % 10 <= 5) {
      // Glass + aura only (kind 0-5); filament/neck/base/threads fall through to the
      // generic directional light below since they aren't on the BULB_CENTER sphere.
      const dx = x - BULB_CENTER[0];
      const dy = y - BULB_CENTER[1];
      const dz = z - BULB_CENTER[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const nx = dx / dist, ny = dy / dist, nz = dz / dist;
      const shadowTerm = 0.5 + 0.5 * (nx * -0.5 + ny * 0.6 + nz * 0.62);
      if (dist > BULB_RADIUS + 0.015) {
        // Aura: a soft glow shell that thins out the further it sits from the glass.
        const auraT = Math.max(0, Math.min(1, (dist - BULB_RADIUS) / BULB_AURA_SPAN));
        light = Math.max(0.12, 0.55 * (1 - auraT) * (0.6 + 0.4 * shadowTerm));
      } else {
        // Glass: a fresnel-style rim, bright at the silhouette and dim toward the
        // center-facing zone, so the middle of the globe reads as a bit see-through
        // rather than a solid disc, with a soft directional shadow across it.
        const fresnel = 1 - Math.min(1, Math.abs(nz));
        light = 0.18 + 0.38 * shadowTerm + 0.58 * Math.pow(fresnel, 1.6);
      }
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
