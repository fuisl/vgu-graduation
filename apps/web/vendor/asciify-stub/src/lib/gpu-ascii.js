// Stand-in for the real ASCIIGen engine (`asciify`), used only when that
// private, optional dependency isn't installed. See next.config.mjs and
// docs/development/private-dependencies.md.
//
// gpuSupported() is the one export AsciiLive.tsx calls before it renders any
// camera UI, so it throws a sentinel error the page recognizes and turns
// into a plain "not available in this build" message, rather than the
// "no WebGL2" error the real check would report.
export const ENGINE_MISSING = "ASCIIFY_NOT_INSTALLED";

export function gpuSupported() {
  throw new Error(ENGINE_MISSING);
}

export function measureLevels() {
  return [0, 1];
}

export class GpuAscii {
  constructor() {
    throw new Error(ENGINE_MISSING);
  }

  render() {
    return { columns: 0, rows: 0 };
  }

  dispose() {}
}
