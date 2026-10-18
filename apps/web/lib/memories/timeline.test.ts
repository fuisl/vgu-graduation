import { describe, expect, it } from "vitest";
import { buildTimeline, dayKey, formatClock, PHOTO_RUN_MAX } from "./timeline";

const photo = (publicId: string, createdAt: string) => ({ publicId, width: 800, height: 600, createdAt });
const wish = (id: string, createdAt: string) => ({ id, authorName: "Minh", body: "Congrats", createdAt });

// 09:00 to 11:00 in Ho Chi Minh City (UTC+7).
const event = { startsAt: "2026-11-20T02:00:00.000Z", endsAt: "2026-11-20T04:00:00.000Z", timeZone: "Asia/Ho_Chi_Minh" };

describe("buildTimeline", () => {
  it("splits the ceremony day into arrival, ceremony and celebration, with the days around it", () => {
    const timeline = buildTimeline({
      photos: [
        photo("after", "2026-11-21T03:00:00.000Z"),
        photo("party", "2026-11-20T10:00:00.000Z"),
        photo("stage", "2026-11-20T02:10:00.000Z"),
        photo("gate", "2026-11-20T00:30:00.000Z"),
        photo("rehearsal", "2026-11-18T09:00:00.000Z"),
      ],
      wishes: [wish("w1", "2026-11-20T03:59:59.000Z")],
      event,
    });
    expect(timeline.mode).toBe("schedule");
    expect(timeline.chapters.map((c) => c.id)).toEqual(["before", "arrival", "ceremony", "celebration", "after"]);
    const ceremony = timeline.chapters[2];
    expect(ceremony.range).toBe("09:00–11:00");
    expect(ceremony.photoCount).toBe(1);
    expect(ceremony.wishCount).toBe(1);
    expect(timeline.chapters[1].range).toBe("Until 09:00");
    expect(timeline.chapters[3].range).toBe("From 11:00");
    expect(timeline.chapters[0].range).toBe("18 Nov");
  });

  it("uses the calendar feed's two-hour default when the event has no end", () => {
    const timeline = buildTimeline({
      photos: [photo("p", "2026-11-20T03:30:00.000Z")],
      wishes: [],
      event: { ...event, endsAt: null },
    });
    expect(timeline.chapters[0]).toMatchObject({ id: "ceremony", range: "09:00–11:00" });
  });

  it("orders entries oldest first and groups a burst of photos into one entry", () => {
    const burst = Array.from({ length: PHOTO_RUN_MAX + 1 }, (_, i) => photo(`b${i}`, `2026-11-20T02:${String(10 + i).padStart(2, "0")}:00.000Z`));
    const timeline = buildTimeline({
      photos: [...burst].reverse(),
      wishes: [wish("w", "2026-11-20T02:05:00.000Z")],
      event,
    });
    const entries = timeline.chapters[0].entries;
    expect(entries.map((e) => e.kind)).toEqual(["wish", "photos", "photos"]);
    expect(entries[1].kind === "photos" && entries[1].photos.map((p) => p.publicId)).toEqual(burst.slice(0, PHOTO_RUN_MAX).map((p) => p.publicId));
  });

  it("starts a new photo entry after a wish or a gap of more than 30 minutes", () => {
    const timeline = buildTimeline({
      photos: [photo("a", "2026-11-20T02:00:00.000Z"), photo("b", "2026-11-20T02:31:00.000Z"), photo("c", "2026-11-20T02:40:00.000Z")],
      wishes: [wish("w", "2026-11-20T02:35:00.000Z")],
      event,
    });
    expect(timeline.chapters[0].entries.map((e) => e.id)).toEqual(["photos-a", "photos-b", "wish-w", "photos-c"]);
  });

  it("falls back to days without an event, or hours when everything is on one day", () => {
    const days = buildTimeline({
      photos: [photo("a", "2026-11-20T02:00:00.000Z"), photo("b", "2026-11-21T02:00:00.000Z")],
      wishes: [],
      event: null,
    });
    expect(days.mode).toBe("day");
    expect(days.timeZone).toBe("Asia/Ho_Chi_Minh");
    expect(days.chapters.map((c) => c.id)).toEqual(["day-2026-11-20", "day-2026-11-21"]);
    expect(days.chapters[0].title).toBe("Friday 20 November");

    const hours = buildTimeline({
      photos: [photo("a", "2026-11-20T02:00:00.000Z"), photo("b", "2026-11-20T02:59:00.000Z"), photo("c", "2026-11-20T05:00:00.000Z")],
      wishes: [],
      event: null,
    });
    expect(hours.mode).toBe("hour");
    expect(hours.chapters.map((c) => [c.id, c.title, c.photoCount])).toEqual([
      ["hour-09", "09:00", 2],
      ["hour-12", "12:00", 1],
    ]);
  });

  it("returns no chapters when nothing is curated, and survives an unknown time zone", () => {
    expect(buildTimeline({ photos: [], wishes: [], event }).chapters).toEqual([]);
    const timeline = buildTimeline({ photos: [photo("a", "2026-11-20T02:30:00.000Z")], wishes: [], event: { ...event, timeZone: "Mars/Olympus" } });
    expect(timeline.timeZone).toBe("Asia/Ho_Chi_Minh");
  });

  it("formats day keys and clocks in the event's zone", () => {
    expect(dayKey("2026-11-20T18:00:00.000Z", "Asia/Ho_Chi_Minh")).toBe("2026-11-21");
    expect(formatClock("2026-11-20T18:05:00.000Z", "Asia/Ho_Chi_Minh")).toBe("01:05");
  });
});
