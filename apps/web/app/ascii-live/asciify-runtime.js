// Keep ASCIIGen behind a tiny JS boundary. Its Git package publishes application
// TypeScript rather than library declarations; Next still transpiles the real
// source, while the adjacent .d.ts defines only the browser API used here.
export { GpuAscii, gpuSupported, measureLevels } from "asciify/src/lib/gpu-ascii";
export { resolveCharset } from "asciify/shared/engine/charsets";
