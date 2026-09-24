export type CharsetId = "classic" | "blocks" | "braille" | "halfblock" | "custom";

export type CharsetDef = {
  id: CharsetId;
  kind: "vector" | "ramp" | "braille" | "halfblock";
  chars: string;
  grid: { x: number; y: number };
  vectors?: Float32Array;
  vectorGlyph?: Uint16Array;
  ramp?: Uint16Array;
  paletteSize: number;
};

export function gpuSupported(): boolean;
export function measureLevels(source: CanvasImageSource, width: number, height: number): [number, number];
export function resolveCharset(id?: CharsetId, customChars?: string, lines?: "off" | "over" | "only"): CharsetDef;

export class GpuAscii {
  constructor(canvas: HTMLCanvasElement);
  render(source: TexImageSource, sourceWidth: number, sourceHeight: number, settings: {
    columns: number;
    fontAspectRatio: number;
    threshold: number;
    gamma: number;
    contrast: number;
    charset: CharsetDef;
    color: boolean;
    key: "green" | "magenta" | null;
    ink: string;
    scale: number;
    mirror?: boolean;
    levels?: [number, number];
  }): { columns: number; rows: number };
  dispose(): void;
}
