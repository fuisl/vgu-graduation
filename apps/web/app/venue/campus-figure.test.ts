import { describe, expect, it } from "vitest";
import { BUILDINGS, LABELS, VIEW, ellipse, extrude, project, rect, toPercent } from "./campus-figure";

describe("extrude", () => {
  it("draws only the walls facing the viewer", () => {
    const box = extrude({ id: "box", footprint: rect(0, 0, 10, 10), height: 5 });
    // A box shows two of its four sides: the south and the east-facing ones.
    expect(box.walls).toHaveLength(2);
    expect(box.top).toHaveLength(4);
    expect(box.silhouette).toBeNull();
  });

  it("outlines a smooth prism with one silhouette along its visible side", () => {
    const hall = extrude({ id: "hall", footprint: ellipse(0, 0, 60, 20, 64), height: 30, smooth: true });
    expect(hall.walls.length).toBeGreaterThan(20);
    expect(hall.walls.length).toBeLessThan(44);
    // Up at one end, along the base, up at the other: wall count + 1 base points + 2 tops.
    expect(hall.silhouette).toHaveLength(hall.walls.length + 3);
  });

  it("lifts the top face by the building height", () => {
    const [, groundY] = project([0, 0, 0]);
    const [, topY] = project([0, 0, 30]);
    expect(groundY - topY).toBe(30);
  });
});

describe("scene", () => {
  it("highlights exactly one building, the Ceremony Hall", () => {
    expect(BUILDINGS.filter((b) => b.highlight).map((b) => b.id)).toEqual(["ceremony-hall"]);
  });

  it("keeps every label inside the figure", () => {
    for (const label of LABELS) {
      const [ax, ay] = project(label.anchor);
      const { left, top } = toPercent([ax + label.offset[0], ay + label.offset[1]]);
      for (const value of [left, top]) {
        expect(parseFloat(value)).toBeGreaterThanOrEqual(0);
        expect(parseFloat(value)).toBeLessThanOrEqual(100);
      }
    }
    expect(VIEW.width).toBeGreaterThan(VIEW.height);
  });
});
