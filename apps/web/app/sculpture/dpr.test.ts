import { describe, expect, it } from "vitest";
import { cellPixels, gridLayout, initialDpr, lowerDpr } from "./dpr";

describe("initialDpr", () => {
  it("follows the device up to 3", () => {
    expect(initialDpr(1)).toBe(1);
    expect(initialDpr(2.625, 8, 8)).toBe(2.625);
    expect(initialDpr(3, 8)).toBe(3);
    expect(initialDpr(4)).toBe(3);
  });

  it("caps low-end devices at 2", () => {
    expect(initialDpr(3, 4)).toBe(2);
    expect(initialDpr(3, 8, 2)).toBe(2);
  });

  it("never goes below 1", () => {
    expect(initialDpr(0)).toBe(1);
    expect(initialDpr(0.5)).toBe(1);
  });
});

describe("lowerDpr", () => {
  it("steps 3, 2, 1.5, 1 and stays at 1", () => {
    expect(lowerDpr(3)).toBe(2);
    expect(lowerDpr(2.625)).toBe(2);
    expect(lowerDpr(2)).toBe(1.5);
    expect(lowerDpr(1.5)).toBe(1);
    expect(lowerDpr(1)).toBe(1);
  });
});

describe("cellPixels and gridLayout", () => {
  it("snaps cells to whole device pixels", () => {
    expect(cellPixels(6, 8, 1)).toEqual([6, 8]);
    expect(cellPixels(6, 8, 3)).toEqual([18, 24]);
    expect(cellPixels(6, 8, 2.625)).toEqual([16, 21]);
  });

  it("centres whole cells and leaves less than one cell over", () => {
    const layout = gridLayout(358, 554, 6, 8);
    expect(layout).toEqual({ columns: 59, rows: 69, offsetX: 2, offsetY: 1 });
    expect(358 - layout.columns * 6).toBeLessThan(6);
  });
});
