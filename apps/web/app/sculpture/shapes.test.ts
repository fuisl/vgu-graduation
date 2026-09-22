import { describe, expect, it } from "vitest";
import { HOLD_SECONDS, MORPH_SECONDS, POINT_COUNT, sequenceAt, SHADES, SHAPES, SHAPE_NAMES } from "./shapes";

describe("landing sculpture sequence", () => {
  it("keeps all six forms compatible for point-by-point morphing", () => {
    expect(SHAPES).toHaveLength(6);
    expect(SHAPE_NAMES).toHaveLength(6);
    for (const form of SHAPES) {
      expect(form).toHaveLength(POINT_COUNT * 3);
      expect([...form].every(Number.isFinite)).toBe(true);
      expect(Math.max(...form)).toBeLessThan(2.5);
      expect(Math.min(...form)).toBeGreaterThan(-2.5);
    }
    for (const lighting of SHADES) {
      expect(lighting).toHaveLength(POINT_COUNT * 3);
      expect(Math.min(...lighting)).toBeGreaterThan(0);
      expect(Math.max(...lighting) - Math.min(...lighting)).toBeGreaterThan(0.35);
    }
  });

  it("holds each form before morphing and returns to the first form", () => {
    expect(sequenceAt(HOLD_SECONDS - 0.01)).toMatchObject({ index: 0, morph: 0 });
    expect(sequenceAt(HOLD_SECONDS + MORPH_SECONDS / 2).morph).toBeCloseTo(0.5);
    expect(sequenceAt(HOLD_SECONDS + MORPH_SECONDS)).toMatchObject({ index: 1, morph: 0 });
    expect(sequenceAt((HOLD_SECONDS + MORPH_SECONDS) * 6)).toMatchObject({ index: 0, morph: 0 });
  });
});
