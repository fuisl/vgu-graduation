// See src/lib/gpu-ascii.js in this stub directory. Never reached in
// practice: AsciiLive.tsx gates on gpuSupported() before it calls this.
export function resolveCharset() {
  return { id: "classic", kind: "ramp", chars: "", grid: { x: 1, y: 2 }, paletteSize: 1 };
}
