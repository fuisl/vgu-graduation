import {
  BRIDGES,
  BUILDINGS,
  CENTRE_LINES,
  INLINE_LABELS,
  LAWN,
  LEADERS,
  PARKING,
  PARKING_STALLS,
  POND,
  RIVER,
  RIVER_FLOW,
  ROADS,
  ROUNDABOUT,
  ROUTE,
  VIEW,
  extrude,
  flat,
  project,
  toPath,
  type Point,
} from "../../app/venue/campus-figure";

/*
 * The "I'll be there" story card (share to Instagram / Facebook from the guest portal). A
 * 1080×1920 canvas: FIG_001 from /venue with its walkers and river current on a seamless loop,
 * the date, time and venue, and who invited the guest. Everything here is pure so it can be
 * tested; StoryShare.tsx draws it and records the video.
 */

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
/** One loop of the video. Walkers take the whole loop; the current takes two, so both repeat seamlessly. */
export const LOOP_SECONDS = 6;
export const FPS = 30;

/** packages/design-tokens/src/brand.css, copied: a canvas can't read CSS variables. */
export const COLORS = {
  blue: "#1f4bb0",
  white: "#ffffff",
  mutedOnBlue: "#b9c8ee",
} as const;

/** `color-mix(in srgb, white p%, blue)`, as the venue figure's CSS does it. */
export function mixWhite(percent: number, base: string = COLORS.blue): string {
  const p = percent / 100;
  const channels = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  return `#${channels.map((c) => Math.round(255 * p + c * (1 - p)).toString(16).padStart(2, "0")).join("")}`;
}

/* Motion ------------------------------------------------------------------------------------ */

/** Total length of an open polyline. */
export function polylineLength(points: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length;
}

/** The point a fraction `t` (0 to 1) of the way along an open polyline, by distance (SVG's paced motion). */
export function pointAlong(points: readonly Point[], t: number): Point {
  const target = Math.min(Math.max(t, 0), 1) * polylineLength(points);
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const segment = Math.hypot(x1 - x0, y1 - y0);
    if (walked + segment >= target && segment > 0) {
      const f = (target - walked) / segment;
      return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
    }
    walked += segment;
  }
  return points[points.length - 1];
}

const ROUTE_VIEW = flat(ROUTE);
const FLOW_VIEW = flat(RIVER_FLOW);
/** Three walkers two seconds apart, each taking the whole loop, as on /venue. */
const WALKERS = 3;
/** The current at half the walkers' speed: six dots, each taking two loops, so the set repeats every loop. */
const CURRENT_DOTS = 6;
const CURRENT_LOOPS = 2;

/** Walker and current positions (view coordinates) at `seconds` into the loop. */
export function dotsAt(seconds: number): { walkers: Point[]; current: Point[] } {
  const loop = (((seconds % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS) / LOOP_SECONDS;
  const walkers = Array.from({ length: WALKERS }, (_, i) => pointAlong(ROUTE_VIEW, (loop + i / WALKERS) % 1));
  const current = Array.from({ length: CURRENT_DOTS }, (_, i) =>
    pointAlong(FLOW_VIEW, (loop / CURRENT_LOOPS + i / CURRENT_DOTS) % 1),
  );
  return { walkers, current };
}

/* Figure ------------------------------------------------------------------------------------ */

/** Where the figure sits on the card, in card pixels. */
export const FIGURE_BOX = { x: 48, y: 470, width: STORY_WIDTH - 96, height: 720 } as const;

/** View → card pixel transform that fits FIG_001 in `FIGURE_BOX`, centred. */
export function figureTransform(box: { x: number; y: number; width: number; height: number } = FIGURE_BOX) {
  const scale = Math.min(box.width / VIEW.width, box.height / VIEW.height);
  const left = box.x + (box.width - VIEW.width * scale) / 2;
  const top = box.y + (box.height - VIEW.height * scale) / 2;
  return {
    scale,
    width: VIEW.width * scale,
    height: VIEW.height * scale,
    left,
    top,
    toCard: ([x, y]: Point): Point => [left + (x - VIEW.x) * scale, top + (y - VIEW.y) * scale],
  };
}

const prisms = BUILDINGS.map(extrude).sort((a, b) => a.depth - b.depth);

/**
 * FIG_001 as a standalone SVG for a canvas, in two layers so the moving dots can pass between
 * them as they do on /venue: `base` (ground, water, bridges, route) under the dots, `top`
 * (buildings, leader arrows) over them. Colours are inline (CSS doesn't reach an SVG drawn as an
 * image) and strokes are given in view units so they come out at `px` card pixels.
 */
export function figureSvg(scale: number): { base: string; top: string } {
  const w = (px: number) => (px / scale).toFixed(3);
  const open = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${(VIEW.width * scale).toFixed(0)}" height="${(VIEW.height * scale).toFixed(0)}" viewBox="${VIEW.x.toFixed(1)} ${VIEW.y.toFixed(1)} ${VIEW.width.toFixed(1)} ${VIEW.height.toFixed(1)}" fill="none" stroke="${COLORS.white}" stroke-linejoin="round" stroke-linecap="round" stroke-width="${w(2)}">${body}</svg>`;
  const path = (d: string, attrs = "") => `<path d="${d}"${attrs ? ` ${attrs}` : ""}/>`;
  const dash = `stroke-dasharray="${w(8)} ${w(10)}"`;

  const ground = [
    ...ROADS.map((road) => path(toPath(flat(road)))),
    ...CENTRE_LINES.map((line) => path(toPath(flat(line), false), dash)),
    path(toPath(flat(PARKING))),
    ...PARKING_STALLS.map((stall) => path(toPath(flat(stall), false))),
    path(toPath(flat(LAWN)), dash),
    ...ROUNDABOUT.map((ring) => path(toPath(flat(ring)))),
  ].join("");
  const base = open(
    `<defs><pattern id="w" width="18" height="7" patternUnits="userSpaceOnUse"><path d="M2 3.5h8" stroke="${COLORS.white}" stroke-opacity="0.6" stroke-width="${w(1.6)}"/></pattern>` +
      `<clipPath id="r">${path(toPath(flat(RIVER)))}${path(toPath(flat(POND)))}</clipPath></defs>` +
      `<g stroke-opacity="0.55">${ground}</g>` +
      `<rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.width}" height="${VIEW.height}" fill="url(#w)" stroke="none" clip-path="url(#r)"/>` +
      path(toPath(flat(RIVER))) +
      path(toPath(flat(POND))) +
      BRIDGES.map((bridge) => path(toPath(flat(bridge)), `fill="${COLORS.blue}"`)).join("") +
      path(toPath(ROUTE_VIEW, false), `stroke-dasharray="${w(3)} ${w(8)}" stroke-width="${w(3.2)}"`),
  );

  const buildings = prisms
    .map((prism) => {
      const wallFill = prism.highlight ? mixWhite(62) : mixWhite(14);
      const walls = prism.walls
        .map((wall) => path(toPath(wall), prism.smooth ? `fill="${wallFill}" stroke="${mixWhite(62)}"` : `fill="${wallFill}"`))
        .join("");
      const silhouette = prism.silhouette ? path(toPath(prism.silhouette, false)) : "";
      const top = path(toPath(prism.top), `fill="${prism.highlight ? COLORS.white : mixWhite(5)}"`);
      return walls + silhouette + top;
    })
    .join("");
  const leaders = LEADERS.map(({ line, head }) => path(line, `stroke-width="${w(1.6)}"`) + path(head, `fill="${COLORS.white}" stroke="none"`)).join("");
  return { base, top: open(buildings + leaders) };
}

/** The figure's text labels in card pixels: leader labels (one highlighted) and the rotated road and river names. */
export function figureLabels(transform = figureTransform(), translate: (label: string) => string = (label) => label) {
  return {
    leaders: LEADERS.map(({ label, point }) => ({
      text: translate(label.text).toUpperCase(),
      at: transform.toCard(point),
      align: label.align,
      highlight: Boolean(label.highlight),
      minor: Boolean(label.minor),
    })),
    inline: INLINE_LABELS.map((label) => ({
      text: label.text.toUpperCase(),
      at: transform.toCard(project(label.at)),
      angle: (label.angle * Math.PI) / 180,
    })),
  };
}

/* Copy -------------------------------------------------------------------------------------- */

/** What the card says. Built on the server in the guest's language; nothing here is a credential. */
export interface StoryContent {
  /** Mono line top left, e.g. "GRAD '26". */
  mark: string;
  eyebrow: string;
  title: string;
  /** Label/value rows at the foot of the card: when, where, invited by. */
  facts: { label: string; value: string; detail?: string }[];
  /** The public site's host, e.g. "grad26.fuisloy.dev". */
  site: string;
  /** Alt text for the preview. */
  description: string;
}

/** "Ann Nguyen", "Ann Nguyen & Bao Le", "Ann Nguyen, Bao Le & Chi Pham". */
export function joinNames(names: readonly string[], and = "&"): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
}

/* Video ------------------------------------------------------------------------------------- */

/**
 * The first MediaRecorder type Instagram and Facebook take. MP4 only: both reject WebM, so a
 * browser that can only record WebM (Firefox) gets the still image instead.
 */
export const VIDEO_TYPES = ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4"] as const;

export function pickVideoType(isTypeSupported: ((type: string) => boolean) | undefined): string | null {
  if (!isTypeSupported) return null;
  return VIDEO_TYPES.find((type) => isTypeSupported(type)) ?? null;
}
