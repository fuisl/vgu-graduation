/**
 * Whether the landing may download and start the WebGL sculpture (QA P1-4). The static motif is
 * the page's LCP element and stays when this says no: under reduced motion, under Save-Data or
 * `prefers-reduced-data`, and when the browser cannot create a WebGL context at all.
 */
export type SculptureEnvironment = {
  reducedMotion: boolean;
  saveData: boolean;
  webgl: boolean;
};

export function maySculpt({ reducedMotion, saveData, webgl }: SculptureEnvironment): boolean {
  return !reducedMotion && !saveData && webgl;
}

type ConnectionLike = { saveData?: boolean };

/** Reads the environment from the browser. Every probe fails closed (no canvas). */
export function readSculptureEnvironment(win: Window = window): SculptureEnvironment {
  const media = (query: string) => {
    try {
      return win.matchMedia?.(query).matches ?? false;
    } catch {
      return false;
    }
  };
  const connection = (win.navigator as Navigator & { connection?: ConnectionLike }).connection;
  return {
    reducedMotion: media("(prefers-reduced-motion: reduce)"),
    saveData: connection?.saveData === true || media("(prefers-reduced-data: reduce)"),
    webgl: hasWebGL(win.document),
  };
}

function hasWebGL(doc: Document): boolean {
  try {
    const canvas = doc.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    // Hand the probe context back at once; the sculpture creates its own.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
