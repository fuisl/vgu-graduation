import {
  INLINE_LABELS,
  PARKING,
  PARKING_STALLS,
  RIVER_FLOW,
  BRIDGES,
  BUILDINGS,
  CENTRE_LINES,
  LABELS,
  LAWN,
  POND,
  RIVER,
  ROADS,
  ROUNDABOUT,
  ROUTE,
  VIEW,
  extrude,
  flat,
  project,
  toPath,
  toPercent,
} from "./campus-figure";
import { FigureReveal } from "./FigureReveal";

const prisms = BUILDINGS.map(extrude).sort((a, b) => a.depth - b.depth);

const routePath = toPath(flat(ROUTE), false);
const flowPath = toPath(flat(RIVER_FLOW), false);
const ROUTE_SECONDS = 6;
const FLOW_SECONDS = 14;
/** Negative begins start each dot part-way along, so they are evenly spaced from the first frame. */
const ROUTE_DOTS = [0, -2, -4];
const FLOW_DOTS = [0, -2.8, -5.6, -8.4, -11.2];

/**
 * Leader: horizontal from the label, then a vertical drop onto the anchor, ending in an
 * arrowhead. A label level with its anchor gets a straight horizontal arrow.
 */
const leaders = LABELS.map((label) => {
  const [ax, ay] = project(label.anchor);
  const lx = ax + label.offset[0];
  const ly = ay + label.offset[1];
  const f = (v: number) => v.toFixed(1);
  let line: string;
  let head: string;
  if (Math.abs(ay - ly) < 1 && !label.also) {
    const dir = Math.sign(ax - lx) || 1;
    line = `M${f(lx)} ${f(ly)}H${f(ax - 9 * dir)}`;
    head = `M${f(ax)} ${f(ay)}l${f(-9 * dir)} -4.5v9Z`;
  } else {
    // One horizontal run from the label past every drop, then a vertical drop onto each anchor.
    const drops = [label.anchor, ...(label.also ?? [])].map(project);
    const far = drops.reduce((x, [dx]) => (Math.abs(dx - lx) > Math.abs(x - lx) ? dx : x), ax);
    line = `M${f(lx)} ${f(ly)}H${f(far)}`;
    head = "";
    for (const [dx, dy] of drops) {
      const dir = Math.sign(dy - ly);
      line += `M${f(dx)} ${f(ly)}V${f(dy - 9 * dir)}`;
      head += `M${f(dx)} ${f(dy)}l-4.5 ${f(-9 * dir)}h9Z`;
    }
  }
  return { label, line, head, at: toPercent([lx, ly]) };
});

/**
 * FIG_001: blueprint of the campus around Sunrise River with the Ceremony Hall filled in.
 * White line work on the brand blue, after the technical figures of makingsoftware.com: dot
 * grid, single-weight strokes, one solid highlight, dashed route, mono labels on leader arrows.
 * Decorative SVG; the figcaption carries the description for screen readers.
 */
export function CampusFigure() {
  return (
    <FigureReveal>
      <figure className="campus-fig" aria-labelledby="campus-fig-caption">
        <svg className="campus-fig__dots" aria-hidden="true" focusable="false">
          <defs>
            <pattern id="fig001-dots" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="6" cy="6" r="0.9" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#fig001-dots)" />
        </svg>

        <div
          className="campus-fig__stage"
          style={{ aspectRatio: `${VIEW.width} / ${VIEW.height}`, ["--fig-ratio" as string]: (VIEW.width / VIEW.height).toFixed(4) }}
        >
          <svg
            className="campus-fig__drawing"
            viewBox={`${VIEW.x.toFixed(1)} ${VIEW.y.toFixed(1)} ${VIEW.width.toFixed(1)} ${VIEW.height.toFixed(1)}`}
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <pattern id="fig001-water" width="18" height="7" patternUnits="userSpaceOnUse">
                <path d="M2 3.5h8" />
              </pattern>
              <clipPath id="fig001-river">
                <path d={toPath(flat(RIVER))} />
                <path d={toPath(flat(POND))} />
              </clipPath>
            </defs>

            <g className="campus-fig__ground">
              {ROADS.map((road, i) => <path key={i} d={toPath(flat(road))} />)}
              {CENTRE_LINES.map((line, i) => <path key={i} className="campus-fig__dash" d={toPath(flat(line), false)} />)}
              <path d={toPath(flat(PARKING))} />
              {PARKING_STALLS.map((stall, i) => <path key={i} d={toPath(flat(stall), false)} />)}
              <path className="campus-fig__dash" d={toPath(flat(LAWN))} />
              {ROUNDABOUT.map((ring, i) => <path key={i} d={toPath(flat(ring))} />)}
            </g>

            <g className="campus-fig__water">
              <rect
                x={VIEW.x}
                y={VIEW.y}
                width={VIEW.width}
                height={VIEW.height}
                fill="url(#fig001-water)"
                clipPath="url(#fig001-river)"
              />
              <path d={toPath(flat(RIVER))} />
              <path d={toPath(flat(POND))} />
            </g>

            <g className="campus-fig__bridges">
              {BRIDGES.map((bridge, i) => <path key={i} d={toPath(flat(bridge))} />)}
            </g>

            <path className="campus-fig__route" d={toPath(flat(ROUTE), false)} />

            {/* Motion (figures.md): guests walking the route to the hall, and the river's current. Hidden for reduced motion. */}
            <g className="campus-fig__motion">
              {ROUTE_DOTS.map((begin) => (
                <circle key={begin} className="campus-fig__walker" r="4.5">
                  <animateMotion dur={`${ROUTE_SECONDS}s`} begin={`${begin}s`} repeatCount="indefinite" path={routePath} />
                </circle>
              ))}
              {FLOW_DOTS.map((begin) => (
                <circle key={begin} className="campus-fig__current" r="2.2">
                  <animateMotion dur={`${FLOW_SECONDS}s`} begin={`${begin}s`} repeatCount="indefinite" path={flowPath} />
                </circle>
              ))}
            </g>

            {prisms.map((prism) => (
              <g key={prism.id} className={prism.highlight ? "campus-fig__block is-highlight" : "campus-fig__block"}>
                {prism.walls.map((wall, i) => (
                  <path key={i} className={prism.smooth ? "campus-fig__wall is-facet" : "campus-fig__wall"} d={toPath(wall)} />
                ))}
                {prism.silhouette ? <path className="campus-fig__silhouette" d={toPath(prism.silhouette, false)} /> : null}
                <path className="campus-fig__top" d={toPath(prism.top)} />
              </g>
            ))}

            <g className="campus-fig__leaders">
              {leaders.map(({ label, line, head }, i) => (
                <g key={label.text} className={label.minor ? "is-minor" : undefined} style={{ ["--i" as string]: i }}>
                  <path className="campus-fig__leader" d={line} pathLength={1} />
                  <path className="campus-fig__head" d={head} />
                </g>
              ))}
            </g>
          </svg>

          {leaders.map(({ label, at }, i) => (
            <span
              key={label.text}
              className={[
                "campus-fig__label",
                `campus-fig__label--${label.align}`,
                label.highlight ? "is-highlight" : "",
                label.minor ? "is-minor" : "",
              ].filter(Boolean).join(" ")}
              style={{ ...at, ["--i" as string]: i }}
              aria-hidden="true"
            >
              {label.text}
            </span>
          ))}
          {INLINE_LABELS.map((label) => (
            <span
              key={label.text}
              className="campus-fig__label campus-fig__label--inline"
              style={{ ...toPercent(project(label.at)), ["--angle" as string]: `${label.angle.toFixed(2)}deg`, ["--i" as string]: LABELS.length }}
              aria-hidden="true"
            >
              {label.text}
            </span>
          ))}
        </div>

        <span className="campus-fig__meta campus-fig__meta--fig" aria-hidden="true">FIG_001</span>
        <span className="campus-fig__meta campus-fig__meta--title" aria-hidden="true">[ VGU CAMPUS · CEREMONY HALL ]</span>
        <span className="campus-fig__meta campus-fig__meta--year" aria-hidden="true">(C) 2026</span>

        <figcaption id="campus-fig-caption" className="brand-sr-only">
          Map of the VGU campus around Sunrise River. The Ceremony Hall, where the ceremony takes place, is
          highlighted on the north bank beside the library. From the main entrance off Ring Road 4, walk north over
          the West Bridge to reach it.
        </figcaption>
      </figure>
    </FigureReveal>
  );
}
