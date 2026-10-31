import { describe, expect, it } from "vitest";
import { ROUTE, RIVER_FLOW, flat } from "../../app/venue/campus-figure";
import { createI18n } from "../i18n/dictionary";
import { buildStoryContent } from "./content";
import { fitLine, fitTitleSize, wrapLines } from "./draw";
import {
  FIGURE_BOX,
  LOOP_SECONDS,
  dotsAt,
  figureSvg,
  figureTransform,
  joinNames,
  mixWhite,
  pickVideoType,
  pointAlong,
  polylineLength,
} from "./story";

const close = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

describe("motion", () => {
  it("walks a polyline by distance", () => {
    const line = [[0, 0], [10, 0], [10, 10]] as const;
    expect(polylineLength(line)).toBe(20);
    expect(pointAlong(line, 0)).toEqual([0, 0]);
    expect(pointAlong(line, 0.25)).toEqual([5, 0]);
    expect(pointAlong(line, 0.75)).toEqual([10, 5]);
    expect(pointAlong(line, 1)).toEqual([10, 10]);
  });

  it("loops seamlessly: the last frame's dots are the first frame's", () => {
    const first = dotsAt(0);
    const last = dotsAt(LOOP_SECONDS);
    expect(last.walkers.map(String).sort()).toEqual(first.walkers.map(String).sort());
    // The current takes two loops per dot but six dots: after one loop each dot sits where another started.
    for (const point of last.current) expect(first.current.some((other) => close(point, other))).toBe(true);
  });

  it("keeps every dot on its path", () => {
    const route = flat(ROUTE);
    const flow = flat(RIVER_FLOW);
    const xs = (points: readonly (readonly number[])[]) => points.map(([x]) => x);
    for (const seconds of [0, 1.3, 2.9, 5.99]) {
      const { walkers, current } = dotsAt(seconds);
      for (const [x] of walkers) expect(x).toBeGreaterThanOrEqual(Math.min(...xs(route)) - 1e-6);
      for (const [x] of current) expect(x).toBeLessThanOrEqual(Math.max(...xs(flow)) + 1e-6);
    }
  });
});

describe("figure", () => {
  it("fits FIG_001 inside the card's figure box", () => {
    const t = figureTransform();
    expect(t.left).toBeGreaterThanOrEqual(FIGURE_BOX.x);
    expect(t.top).toBeGreaterThanOrEqual(FIGURE_BOX.y);
    expect(t.left + t.width).toBeLessThanOrEqual(FIGURE_BOX.x + FIGURE_BOX.width + 1e-6);
    expect(t.top + t.height).toBeLessThanOrEqual(FIGURE_BOX.y + FIGURE_BOX.height + 1e-6);
  });

  it("renders standalone SVG layers with inline colours and no CSS classes", () => {
    const { base, top } = figureSvg(figureTransform().scale);
    for (const svg of [base, top]) {
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(svg).not.toContain("class=");
      expect(svg).not.toContain("var(");
    }
    expect(top).toContain(`fill="#ffffff"`); // the highlighted hall roof
  });

  it("mixes white into the brand blue like the figure's CSS", () => {
    expect(mixWhite(0)).toBe("#1f4bb0");
    expect(mixWhite(100)).toBe("#ffffff");
    expect(mixWhite(14)).toBe("#3e64bb");
  });
});

describe("text helpers", () => {
  const measure = (text: string) => text.length * 10;
  it("wraps words and fits a line with an ellipsis", () => {
    expect(wrapLines(measure, "I'll be at GRAD '26", 100)).toEqual(["I'll be at", "GRAD '26"]);
    expect(wrapLines(measure, "Hẹn gặp tại GRAD\u00a0'26", 120)).toEqual(["Hẹn gặp tại", "GRAD\u00a0'26"]);
    expect(fitLine(measure, "Ceremony Hall", 200)).toBe("Ceremony Hall");
    expect(fitLine(measure, "Ceremony Hall, Ring Road 4", 100)).toBe("Ceremony…");
  });

  it("shrinks the title to one line, then falls back to two smaller lines", () => {
    expect(fitTitleSize((size) => size * 8, 1000)).toBe(116);
    expect(fitTitleSize((size) => size * 10, 920)).toBe(92);
    expect(fitTitleSize((size) => size * 20, 920)).toBe(64);
  });

  it("joins inviter names", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Ann"])).toBe("Ann");
    expect(joinNames(["Ann", "Bao"])).toBe("Ann & Bao");
    expect(joinNames(["Ann", "Bao", "Chi"], "và")).toBe("Ann, Bao và Chi");
  });
});

describe("pickVideoType", () => {
  it("takes MP4 only, so Instagram and Facebook accept it", () => {
    expect(pickVideoType((type) => type === "video/mp4")).toBe("video/mp4");
    expect(pickVideoType((type) => type.startsWith("video/webm"))).toBeNull();
    expect(pickVideoType(undefined)).toBeNull();
  });
});

describe("buildStoryContent", () => {
  const event = {
    name: "VGU Graduation Ceremony 2026",
    startsAt: "2026-11-20T02:00:00.000Z",
    endsAt: "2026-11-20T05:00:00.000Z",
    timeZone: "Asia/Ho_Chi_Minh",
    timeConfirmed: true,
    venue: { name: "Ceremony Hall", address: "Ring Road 4, Thu Dau Mot", mapUrl: "https://maps.example.com" },
  } as Parameters<typeof buildStoryContent>[0];

  it("carries the date, time, venue and inviters, but no guest data and only the public host", () => {
    const content = buildStoryContent(event, [{ name: "Ann Nguyen" }, { name: "Bao Le" }], "https://grad26.example.com", createI18n("en"));
    expect(content.title).toBe("I'll be at GRAD\u00a0'26");
    expect(content.site).toBe("grad26.example.com");
    expect(content.facts.map((f) => f.label)).toEqual(["When", "Where", "Invited by"]);
    expect(content.facts[0].value).toMatch(/20 November 2026/);
    expect(content.facts[0].detail).toMatch(/09:00\s*[–-]\s*12:00/);
    expect(content.facts[2].value).toBe("Ann Nguyen & Bao Le");
    expect(content.description).toContain("Invited by Ann Nguyen & Bao Le");
  });

  it("drops the invited-by row without inviters and translates", () => {
    const content = buildStoryContent(event, [], "https://grad26.example.com", createI18n("vi"));
    expect(content.facts).toHaveLength(2);
    expect(content.facts[0].label).toBe("Thời gian");
  });
});
