import { describe, expect, it } from "vitest";
import { touchGazeWanted } from "./touch-gaze";

describe("touchGazeWanted", () => {
  it("runs only on touch screens without reduced motion", () => {
    expect(touchGazeWanted({ fine: false, reduced: false })).toBe(true);
    // A mouse is the library driver's job.
    expect(touchGazeWanted({ fine: true, reduced: false })).toBe(false);
    // Reduced motion: a still face everywhere.
    expect(touchGazeWanted({ fine: false, reduced: true })).toBe(false);
    expect(touchGazeWanted({ fine: true, reduced: true })).toBe(false);
  });
});
