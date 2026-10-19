import { maySculpt, readSculptureEnvironment, type SculptureEnvironment } from "../../sculpture/sculpture-gate";

/**
 * Whether the name badge may download and start three.js and Rapier. The CSS badge stays when it
 * says no: the sculpture's rules (reduced motion, Save-Data, no WebGL or only a software renderer,
 * `sculpture-gate.ts`), plus low-power devices, where a physics step and a WebGL frame at 60fps
 * would cost more battery and main thread than a name tag is worth.
 */
export type BadgeEnvironment = SculptureEnvironment & { lowPower: boolean };

export function mayDropBadge(environment: BadgeEnvironment): boolean {
  return maySculpt(environment) && !environment.lowPower;
}

/** Two or fewer cores, or 2 GB or less of memory. Both are navigator hints and may be missing. */
export function isLowPower(cores?: number, memoryGb?: number): boolean {
  return (cores !== undefined && cores > 0 && cores <= 2) || (memoryGb !== undefined && memoryGb > 0 && memoryGb <= 2);
}

type NavigatorHints = Navigator & { deviceMemory?: number };

/** Reads the environment from the browser. Every probe fails closed (no canvas). */
export function readBadgeEnvironment(win: Window = window): BadgeEnvironment {
  const navigator = win.navigator as NavigatorHints;
  return {
    ...readSculptureEnvironment(win),
    lowPower: isLowPower(navigator.hardwareConcurrency, navigator.deviceMemory),
  };
}
