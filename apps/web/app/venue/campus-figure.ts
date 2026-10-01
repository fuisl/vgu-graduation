/**
 * Geometry for the venue blueprint (FIG_001): the stretch of VGU campus around Sunrise River,
 * drawn isometric in the style of a technical figure. Plan coordinates are traced from the
 * official campus map (pixels of the 1536px-wide print, y pointing south); heights are
 * illustrative. Everything here is pure data and maths so it can be tested and rendered on
 * the server without a client bundle.
 */

export type Point = readonly [number, number];
export type Point3 = readonly [number, number, number];

/** Plan rotation and vertical squash of the axonometric view: the river runs nearly across the frame. */
const ANGLE = (20 * Math.PI) / 180;
const SQUASH = 0.55;
const SIN = Math.sin(ANGLE);
const COS = Math.cos(ANGLE);

/** Axonometric projection: plan rotated by ANGLE and squashed, z straight up. */
export function project([x, y, z]: Point3): Point {
  return [x * COS - y * SIN, (x * SIN + y * COS) * SQUASH - z];
}

/** How near a plan point is to the viewer (larger is nearer); walls facing this way are visible. */
const nearness = (x: number, y: number) => x * SIN + y * COS;

export function ellipse(cx: number, cy: number, rx: number, ry: number, steps = 40): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)] as const;
  });
}

export function rect(x1: number, y1: number, x2: number, y2: number): Point[] {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}

export type Building = {
  id: string;
  footprint: Point[];
  height: number;
  highlight?: boolean;
  /** A curved footprint: facets are filled but not stroked, and one silhouette is drawn instead. */
  smooth?: boolean;
};

export type Prism = {
  id: string;
  highlight: boolean;
  smooth: boolean;
  /** Walls facing the viewer, back to front, as projected quads. */
  walls: Point[][];
  top: Point[];
  /** For smooth prisms: the visible side's outline (up, along the base, back up). */
  silhouette: Point[] | null;
  /** Painter's order: larger is nearer the viewer. */
  depth: number;
};

/**
 * Extrudes a (convex) footprint. A wall is visible when its outward normal faces the viewer,
 * who looks from +x+y; walls are ordered back to front so nearer ones paint over farther ones.
 */
export function extrude({ id, footprint, height, highlight = false, smooth = false }: Building): Prism {
  const n = footprint.length;
  const cx = footprint.reduce((sum, [x]) => sum + x, 0) / n;
  const cy = footprint.reduce((sum, [, y]) => sum + y, 0) / n;
  const walls: { depth: number; quad: Point[] }[] = [];
  const visible: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = footprint[i];
    const [bx, by] = footprint[(i + 1) % n];
    let nx = by - ay;
    let ny = -(bx - ax);
    if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    visible[i] = nearness(nx, ny) > 0;
    if (!visible[i]) continue;
    walls.push({
      depth: nearness(ax, ay) + nearness(bx, by),
      quad: [project([ax, ay, 0]), project([bx, by, 0]), project([bx, by, height]), project([ax, ay, height])],
    });
  }
  walls.sort((a, b) => a.depth - b.depth);

  let silhouette: Point[] | null = null;
  const start = visible.findIndex((v, i) => v && !visible[(i - 1 + n) % n]);
  if (smooth && start >= 0) {
    const run: number[] = [];
    for (let k = 0; k < n && visible[(start + k) % n]; k++) run.push((start + k) % n);
    const ends = [run[0], (run[run.length - 1] + 1) % n];
    const base = [...run, ends[1]].map((i) => project([footprint[i][0], footprint[i][1], 0]));
    silhouette = [
      project([footprint[ends[0]][0], footprint[ends[0]][1], height]),
      ...base,
      project([footprint[ends[1]][0], footprint[ends[1]][1], height]),
    ];
  }

  return {
    id,
    highlight,
    smooth,
    walls: walls.map((wall) => wall.quad),
    top: footprint.map(([x, y]) => project([x, y, height])),
    silhouette,
    depth: nearness(cx, cy),
  };
}

export function toPath(points: readonly Point[], closed = true): string {
  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return closed ? `${d}Z` : d;
}

export const flat = (points: readonly Point[]): Point[] => points.map(([x, y]) => project([x, y, 0]));

/* Scene --------------------------------------------------------------------------------- */

export const HALL_CENTER: Point3 = [1015, 602, 34];

export const BUILDINGS: Building[] = [
  { id: "academic-a", footprint: rect(612, 455, 680, 540), height: 46 },
  { id: "academic-b", footprint: rect(612, 548, 680, 632), height: 46 },
  { id: "academic-c", footprint: rect(716, 450, 782, 500), height: 36 },
  { id: "academic-d", footprint: rect(716, 507, 782, 560), height: 36 },
  { id: "academic-e", footprint: rect(716, 567, 782, 632), height: 36 },
  { id: "lecture-hall", footprint: rect(808, 398, 922, 462), height: 28 },
  { id: "food-court", footprint: rect(1062, 472, 1098, 555), height: 22 },
  { id: "dorm-1", footprint: rect(1125, 548, 1200, 630), height: 58 },
  {
    id: "library",
    footprint: [[832, 580], [852, 573], [906, 576], [934, 598], [916, 622], [842, 622], [828, 604]],
    height: 26,
  },
  { id: "administration", footprint: rect(612, 702, 786, 758), height: 22 },
  { id: "atrium", footprint: [[931, 614], [956, 578], [981, 614]], height: 44 },
  { id: "ceremony-hall", footprint: ellipse(1015, 602, 64, 24, 64), height: HALL_CENTER[2], highlight: true, smooth: true },
];

/** Sunrise River: the main channel and its bend south past the West Bridge. */
export const RIVER: Point[] = [
  [560, 648], [1104, 648], [1110, 700], [1104, 760], [1090, 800], [1050, 802], [1034, 760], [1012, 712], [990, 690], [560, 690],
];
export const POND: Point[] = rect(1116, 649, 1250, 680);

export const BRIDGES: Point[][] = [rect(700, 640, 722, 698), rect(941, 640, 963, 698)];

/** Road edges, drawn as outlines. */
export const ROADS: Point[][] = [
  rect(560, 815, 1250, 845),
  rect(986, 768, 1016, 815),
  rect(792, 782, 920, 794),
];

/** Outdoor car park just west of the entrance roundabout (the striped stalls on the campus map). */
export const PARKING: Point[] = rect(846, 734, 892, 778);
export const PARKING_STALLS: Point[][] = Array.from({ length: 7 }, (_, i) => {
  const y = 739 + i * 5.8;
  return [[849, y], [889, y]] as Point[];
});
/** Dashed road centre lines. */
export const CENTRE_LINES: Point[][] = [[[560, 830], [1250, 830]]];

export const LAWN: Point[] = ellipse(955, 525, 95, 48, 56);
export const ROUNDABOUT: Point[][] = [ellipse(952, 735, 34, 34, 48), ellipse(952, 735, 20, 20, 36)];

/** Walk from the gate on Ring Road, up the entrance road, over the West Bridge, to the hall's atrium. */
export const ROUTE: Point[] = [[1001, 830], [1001, 770], [952, 701], [952, 640], [956, 616]];

/** Centre line of Sunrise River, west to east and round the bend, for the drifting current dots. */
export const RIVER_FLOW: Point[] = [[565, 669], [990, 669], [1040, 690], [1072, 740], [1078, 790]];

export type Label = {
  text: string;
  /** What the leader arrow points at. */
  anchor: Point3;
  /** More places with the same name: the leader forks, one vertical drop per anchor (like ANODES in the reference). */
  also?: Point3[];
  /** Where the label sits, relative to the anchor's projection. */
  offset: Point;
  align: "left" | "right";
  highlight?: boolean;
  /** Hidden on narrow screens, where the figure is too small to carry every label. */
  minor?: boolean;
};

export const LABELS: Label[] = [
  { text: "Ceremony Hall", anchor: HALL_CENTER, offset: [-108, -218], align: "right", highlight: true },
  { text: "Entrance", anchor: [952, 735, 0], offset: [-43, 186], align: "right" },
  { text: "West Bridge", anchor: [963, 669, 0], offset: [64, 178], align: "left" },
  { text: "Ring Road 4", anchor: [660, 845, 0], offset: [-30, 80], align: "right", minor: true },
  // Parking at the administration building and in the outdoor lot by the roundabout.
  { text: "Parking", anchor: [640, 758, 11], also: [[869, 778, 0]], offset: [-18, 193], align: "right" },
];

/** Labels written along a feature instead of on a leader. */
export type InlineLabel = {
  text: string;
  at: Point3;
  /** Position below 1200px wide, where the drawing is small and the label long relative to it. */
  atNarrow?: Point3;
  angle: number;
};

/** The river's on-screen slope: plan east-west lines run at this angle. */
export const RIVER_ANGLE = (Math.atan2(Math.sin(ANGLE) * SQUASH, Math.cos(ANGLE)) * 180) / Math.PI;

export const INLINE_LABELS: InlineLabel[] = [
  // Wide screens: midway along the open water. Narrow: further west, clear of the Parking and West Bridge drops.
  { text: "Sunrise River", at: [868, 669, 0], atNarrow: [786, 669, 0], angle: RIVER_ANGLE },
];

/* Frame ---------------------------------------------------------------------------------- */

function sceneBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  const points: Point[] = [
    ...flat(RIVER),
    ...ROADS.flatMap(flat),
    ...BUILDINGS.flatMap((b) => b.footprint.flatMap(([x, y]) => [project([x, y, 0]), project([x, y, b.height])])),
    ...LABELS.map((l) => {
      const [ax, ay] = project(l.anchor);
      return [ax + l.offset[0], ay + l.offset[1]] as const;
    }),
  ];
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

const PAD = 60;
const bounds = sceneBounds();

/** The SVG viewBox: the whole scene plus room for the labels. */
export const VIEW = {
  x: bounds.minX - PAD,
  y: bounds.minY - PAD,
  width: bounds.maxX - bounds.minX + PAD * 2,
  height: bounds.maxY - bounds.minY + PAD * 2,
};

/** A view point as percentages of the figure box, for positioning HTML labels over the SVG. */
export function toPercent([x, y]: Point): { left: string; top: string } {
  return {
    left: `${(((x - VIEW.x) / VIEW.width) * 100).toFixed(3)}%`,
    top: `${(((y - VIEW.y) / VIEW.height) * 100).toFixed(3)}%`,
  };
}
