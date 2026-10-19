import {SETTLE, project, pursuit, step, survey, threshold} from "blobatar/gaze";

/** How long the eyes keep looking at the last touch before handing back to the idle glance. */
export const TOUCH_HOLD_MS = 2500;

/**
 * Whether the touch driver should run. The library's own driver covers a fine hovering pointer
 * (a mouse); this one is only for touch screens, and never under reduced motion.
 */
export function touchGazeWanted(media: {fine: boolean; reduced: boolean}): boolean {
  return !media.fine && !media.reduced;
}

/**
 * Eyes that follow the last touch on phones (#139), for the large profile avatar only.
 *
 * The library's `gaze()` driver deliberately arms only for `(hover: hover) and (pointer: fine)`,
 * so on a phone the face would never look anywhere. This is the same pursuit the library runs,
 * built from its exported pure steps (`step`, `project`, `survey`, `pursuit`, `threshold`) and
 * writing the same custom properties `gaze.css` reads, with a touch as the target:
 * - one passive window `pointerdown`/`pointermove` listener for touch and pen, rAF-driven,
 *   parked as soon as the eyes settle (no frames while nothing moves);
 * - after TOUCH_HOLD_MS without a touch the target is released, so the eyes ease home and the
 *   library's idle glance (and blink) carry on;
 * - nothing runs under reduced motion, and rAF stops by itself in a hidden tab.
 * Returns a teardown that removes every listener and property.
 */
export function touchGaze(svg: SVGSVGElement): () => void {
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (!touchGazeWanted({fine: fine.matches, reduced: reduced.matches})) return () => {};

  const eyesGroup = svg.querySelector<SVGElement>(".mo-eyes") ?? svg;
  const eyes = svg.querySelectorAll(".mo-eye");
  const face = survey(svg);
  if (!face || !eyes.length) return () => {};

  let target: {x: number; y: number} | null = null;
  let x = 0, y = 0, hold = 0, holdTarget = 0, last = 0, raf = 0;
  let release: ReturnType<typeof setTimeout> | undefined;

  const frame = (t: number) => {
    raf = 0;
    const dt = last ? Math.min(t - last, 64) : 16;
    last = t;
    const r = svg.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const travel = parseFloat(getComputedStyle(eyesGroup).getPropertyValue("--mo-track-travel")) || 0;
    const k = pursuit(dt, SETTLE);
    const s = step({
      x,
      y,
      dx: target ? target.x - cx : 0,
      dy: target ? target.y - cy : 0,
      radius: Math.max(1, Math.min(r.width, r.height) / 2),
      k,
    });
    const eps = threshold(Math.max(1, r.width), travel);
    let moving = Math.abs(s.tx - s.x) > eps || Math.abs(s.ty - s.y) > eps;
    x = moving ? s.x : s.tx;
    y = moving ? s.y : s.ty;
    hold += (holdTarget - hold) * k;
    if (Math.abs(holdTarget - hold) <= 0.01) hold = holdTarget;
    else moving = true;

    // Same channels as the library driver: the hold on the svg, the projection on the eyes.
    svg.style.setProperty("--mo-track-hold", hold.toFixed(3));
    eyesGroup.style.setProperty("--mo-track-x", x.toFixed(3));
    eyesGroup.style.setProperty("--mo-track-y", y.toFixed(3));
    face.marks.forEach((mark, i) => {
      if (i >= eyes.length) return;
      const p = project(mark, (x * travel) / face.rx, (y * travel) / face.ry);
      const n = i + 1;
      eyesGroup.style.setProperty(`--mo-gz-dx${n}`, (p.dx * face.rx).toFixed(3));
      eyesGroup.style.setProperty(`--mo-gz-dy${n}`, (p.dy * face.ry).toFixed(3));
      eyesGroup.style.setProperty(`--mo-gz-sx${n}`, p.sx.toFixed(4));
      eyesGroup.style.setProperty(`--mo-gz-sy${n}`, p.sy.toFixed(4));
      eyesGroup.style.setProperty(`--mo-gz-t${n}`, p.t.toFixed(3));
    });

    if (moving) raf = requestAnimationFrame(frame);
    else last = 0;
  };

  const wake = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const onTouch = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    target = {x: event.clientX, y: event.clientY};
    holdTarget = 1;
    clearTimeout(release);
    release = setTimeout(() => {
      target = null;
      holdTarget = 0;
      wake();
    }, TOUCH_HOLD_MS);
    wake();
  };

  addEventListener("pointerdown", onTouch, {passive: true});
  addEventListener("pointermove", onTouch, {passive: true});

  return () => {
    removeEventListener("pointerdown", onTouch);
    removeEventListener("pointermove", onTouch);
    clearTimeout(release);
    if (raf) cancelAnimationFrame(raf);
    svg.style.removeProperty("--mo-track-hold");
    eyesGroup.style.removeProperty("--mo-track-x");
    eyesGroup.style.removeProperty("--mo-track-y");
    for (let n = 1; n <= eyes.length; n++) {
      for (const key of ["dx", "dy", "sx", "sy", "t"]) eyesGroup.style.removeProperty(`--mo-gz-${key}${n}`);
    }
  };
}
