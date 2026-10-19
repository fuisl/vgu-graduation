/**
 * Whether the landing may download and start the WebGL sculpture (QA P1-4). The static motif is
 * the page's LCP element and stays when this says no: under reduced motion, under Save-Data or
 * `prefers-reduced-data`, and when the browser cannot create a WebGL context at all or only a
 * software-rendered one.
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

/**
 * A context the GPU draws. A software one (SwiftShader, llvmpipe: no usable GPU, or a blocklisted
 * one) counts as none (#78): it draws every frame on the CPU and, with software compositing, reads
 * each frame back on the main thread (on a fast laptop, a ~170ms first frame and ~25ms a frame after).
 * Browsers that apply `failIfMajorPerformanceCaveat` refuse such a context; the renderer name
 * catches the rest (headless Chromium, for one, hands out SwiftShader regardless).
 */
const CONTEXT_OPTIONS: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software/i;

export function isSoftwareRenderer(gl: WebGLRenderingContext): boolean {
  let name = String(gl.getParameter(gl.RENDERER) ?? "");
  // Chromium and Safari mask RENDERER ("WebKit WebGL"); Firefox already reports the real name.
  if (/webkit webgl/i.test(name)) {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? "");
  }
  return SOFTWARE_RENDERER.test(name);
}

function hasWebGL(doc: Document): boolean {
  try {
    const canvas = doc.createElement("canvas");
    const gl = (canvas.getContext("webgl2", CONTEXT_OPTIONS) ?? canvas.getContext("webgl", CONTEXT_OPTIONS)) as WebGLRenderingContext | null;
    if (!gl) return false;
    const usable = !isSoftwareRenderer(gl);
    // Hand the probe context back at once; the sculpture creates its own.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return usable;
  } catch {
    return false;
  }
}
