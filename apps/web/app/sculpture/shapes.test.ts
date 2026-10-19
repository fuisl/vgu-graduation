import { describe, expect, it, vi } from "vitest";
import { HOLD_SECONDS, MORPH_SECONDS, POINT_COUNT, sequenceAt, SHAPE_COUNT, shapeData, SHAPE_NAMES } from "./shapes";

describe("landing sculpture sequence", () => {
  it("keeps all six forms compatible for point-by-point morphing", () => {
    expect(SHAPE_COUNT).toBe(6);
    expect(SHAPE_NAMES).toHaveLength(6);
    for (let index = 0; index < SHAPE_COUNT; index++) {
      const { points: form, shades: lighting } = shapeData(index);
      expect(form).toHaveLength(POINT_COUNT * 3);
      expect([...form].every(Number.isFinite)).toBe(true);
      expect(Math.max(...form)).toBeLessThan(2.5);
      expect(Math.min(...form)).toBeGreaterThan(-2.5);
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

  it("builds each form once and keeps it, so a morph never regenerates (#78)", () => {
    expect(shapeData(2)).toBe(shapeData(2));
  });

  it("yields to the main thread between forms, not inside one long task (#78)", async () => {
    vi.resetModules();
    const fresh = await import("./shapes");
    let yields = 0;
    await fresh.prepareShapes(async () => { yields += 1; });
    expect(yields).toBe(SHAPE_COUNT);
    // Once built, the forms are reused: a second call has nothing to do.
    await fresh.prepareShapes(async () => { yields += 1; });
    expect(yields).toBe(SHAPE_COUNT);
    expect(fresh.shapeData(0).points).toEqual(shapeData(0).points);
  });
});
