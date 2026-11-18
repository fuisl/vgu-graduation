import { readFileSync } from "node:fs";
import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createI18n, pickMessages } from "../../lib/i18n/dictionary";
import { en } from "../../lib/i18n/messages/en";
import { vi } from "../../lib/i18n/messages/vi";
import { JOURNEY_ENTRIES, type JourneyEntry } from "./entries";
import { JourneyList } from "./JourneyList";
import { INITIAL_SELECTION, selectEntry, selectPhoto, stepEntry } from "./selection";
import { MAX_PHOTOS, resolveEntries, type JourneyEntryView } from "./view";

const i18n = createI18n("en");
const list = (entries: JourneyEntryView[], locale: "en" | "vi" = "en") =>
  html(<JourneyList entries={entries} messages={pickMessages(locale, "landing.journey.ui.")} locale={locale} />);
const shipped = () => resolveEntries(JOURNEY_ENTRIES, i18n.t);
/** The shipped entries with every photo path cleared, as before the owner adds media. */
const withoutMedia = () =>
  resolveEntries(
    JOURNEY_ENTRIES.map((entry) => (entry.kind === "photos" ? { ...entry, photos: entry.photos.map((photo) => ({ ...photo, src: "" })) } : entry)),
    i18n.t,
  );

const film = shipped()[0] as JourneyEntryView;
const chapter = shipped()[1] as JourneyEntryView;

describe("selection", () => {
  it("starts on the first entry, the film", () => {
    expect(INITIAL_SELECTION).toEqual({ entry: 0, photo: 0 });
    expect(JOURNEY_ENTRIES[0]?.kind).toBe("video");
  });

  it("opens an entry at its first photo, and ignores an index outside the list", () => {
    expect(selectEntry({ entry: 1, photo: 3 }, 2, 5)).toEqual({ entry: 2, photo: 0 });
    expect(selectEntry({ entry: 1, photo: 3 }, 1, 5)).toEqual({ entry: 1, photo: 3 });
    expect(selectEntry({ entry: 1, photo: 0 }, 5, 5)).toEqual({ entry: 1, photo: 0 });
    expect(selectEntry({ entry: 1, photo: 0 }, -1, 5)).toEqual({ entry: 1, photo: 0 });
  });

  it("steps with ← and Next →, wrapping round both ends", () => {
    expect(stepEntry({ entry: 0, photo: 2 }, 1, 5)).toEqual({ entry: 1, photo: 0 });
    expect(stepEntry({ entry: 4, photo: 0 }, 1, 5)).toEqual({ entry: 0, photo: 0 });
    expect(stepEntry({ entry: 0, photo: 0 }, -1, 5)).toEqual({ entry: 4, photo: 0 });
    expect(stepEntry({ entry: 0, photo: 0 }, 1, 0)).toEqual({ entry: 0, photo: 0 });
  });

  it("picks a photo within the chapter only", () => {
    expect(selectPhoto({ entry: 1, photo: 0 }, 3, 4)).toEqual({ entry: 1, photo: 3 });
    expect(selectPhoto({ entry: 1, photo: 1 }, 4, 4)).toEqual({ entry: 1, photo: 1 });
  });
});

describe("the entries data", () => {
  it("lists the film, then five chapters of four photos each", () => {
    expect(JOURNEY_ENTRIES.map((entry) => entry.file)).toEqual([
      "01_the_film.mp4",
      "02_presto.jpg",
      "03_career_fair.jpg",
      "04_germany.jpg",
      "05_friend_group.jpg",
      "06_study.jpg",
    ]);
    expect(JOURNEY_ENTRIES.map((entry) => (entry.kind === "photos" ? entry.photos.length : 0))).toEqual([0, 4, 4, 4, 4, 4]);
  });

  it("keeps filenames in plain ASCII and each one unique", () => {
    for (const { file } of JOURNEY_ENTRIES) expect(file).toMatch(/^[\x21-\x7e]+$/);
    expect(new Set(JOURNEY_ENTRIES.map((entry) => entry.file)).size).toBe(JOURNEY_ENTRIES.length);
  });

  it("never points at a remote image, and adds no video file to the repo", () => {
    for (const entry of JOURNEY_ENTRIES) {
      const images = entry.kind === "photos" ? entry.photos.map((photo) => photo.src) : [entry.poster, entry.captions.en, entry.captions.vi];
      for (const src of images) expect(src === "" || src.startsWith("/journey/"), src).toBe(true);
      if (entry.kind === "video") expect(entry.src).not.toMatch(/^\/(?!\/)/);
    }
  });

  it("every key it names has a message in both languages", () => {
    const keys = JOURNEY_ENTRIES.flatMap((entry) => [
      entry.titleKey,
      entry.dateKey,
      entry.storyKey,
      ...(entry.kind === "photos" ? entry.photos.map((photo) => photo.altKey) : [entry.altKey]),
    ]);
    for (const key of keys) {
      expect(en[key]?.trim(), key).toBeTruthy();
      expect(vi[key]?.trim(), key).toBeTruthy();
    }
  });
});

describe("the i18n keys", () => {
  it("has the heading exactly the same in both languages", () => {
    expect(en["landing.journey.heading"]).toBe("the-journey/");
    expect(vi["landing.journey.heading"]).toBe("the-journey/");
  });

  it("no longer carries the entry points", () => {
    for (const dictionary of [en, vi]) {
      expect(Object.keys(dictionary).filter((key) => key.startsWith("landing.entry") || key === "landing.start")).toEqual([]);
    }
  });

  it("renders Vietnamese text, keeping the filenames", () => {
    const out = list(resolveEntries(JOURNEY_ENTRIES, createI18n("vi").t), "vi");
    expect(out).toContain("Bộ phim");
    expect(out).toContain("01_the_film.mp4");
    expect(out).toContain("Tiếp theo");
    expect(out).not.toContain("Film to come");
  });
});

describe("JourneyList", () => {
  it("renders every entry with the first one open, and each row controls its panel", () => {
    const out = list(shipped());
    expect(out.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(out.match(/aria-expanded="false"/g)).toHaveLength(JOURNEY_ENTRIES.length - 1);
    expect(out).toMatch(/aria-expanded="true" aria-controls="journey-panel-0"/);
    expect(out.match(/<div id="journey-panel-\d" class="journey-panel"/g)).toHaveLength(JOURNEY_ENTRIES.length);
    expect(out).toMatch(/<div id="journey-panel-0" class="journey-panel">/);
    expect(out).toMatch(/<div id="journey-panel-1" class="journey-panel" hidden/);
  });

  it("renders any number of entries: chapters are a data change only", () => {
    expect(list([film]).match(/class="journey-row"/g)).toHaveLength(1);
    const many = Array.from({ length: 9 }, (_, index) => ({ ...chapter, file: `${index}.jpg` }));
    const out = list(many);
    expect(out.match(/class="journey-row"/g)).toHaveLength(9);
    expect(out).toContain("--journey-count:9");
  });

  it("shows ← and Next → with accessible names", () => {
    const out = list(shipped());
    expect(out).toContain('aria-label="Previous"');
    expect(out).toContain(">Next<");
  });
});

describe("empty media", () => {
  it("shows labelled plates and loads nothing while no media is set", () => {
    const out = list(withoutMedia());
    expect(out).toContain("Film to come");
    expect(out).toContain("Photo 1 of 4 to come");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<video");
  });

  it("labels each row's empty thumbnail by its kind", () => {
    const out = list(withoutMedia());
    expect(out.match(/journey-row__kind[^>]*>Video</g)).toHaveLength(1);
    expect(out.match(/journey-row__kind[^>]*>Photo</g)).toHaveLength(5);
  });

  it("keeps a plate for a chapter with no photos listed", () => {
    const empty: JourneyEntry = { ...JOURNEY_ENTRIES[1], kind: "photos", photos: [] } as JourneyEntry;
    const out = list(resolveEntries([empty], i18n.t));
    expect(out).toContain("Photo 1 of 1 to come");
    expect(out).not.toContain("journey-flashbacks");
  });
});

describe("with media set", () => {
  const photos = (count: number) => Array.from({ length: count }, (_, index) => ({ src: `/journey/${index}.jpg`, alt: `Alt ${index}` }));

  it("gives the video native controls, no autoplay or preload, a poster, and both caption tracks", () => {
    const out = list([{ ...film, video: { src: "https://video.example/film.mp4", poster: "/journey/poster.jpg", label: "The film", captions: { en: "/journey/en.vtt", vi: "/journey/vi.vtt" } } }]);
    expect(out).toMatch(/<video[^>]* controls=""/);
    expect(out).toMatch(/<video[^>]* preload="none"/);
    expect(out).toMatch(/<video[^>]* poster="[^"]*journey%2Fposter\.jpg/);
    expect(out).not.toContain("autoplay");
    expect(out).toMatch(/<track[^>]*src="\/journey\/en\.vtt"[^>]*srcLang="en"[^>]*default/);
    expect(out).toMatch(/<track[^>]*src="\/journey\/vi\.vtt"[^>]*srcLang="vi"/);
  });

  it("loads only the open entry's main photo at once", () => {
    const chapters = [
      { ...chapter, file: "a.jpg", photos: photos(2), thumb: "" },
      { ...chapter, file: "b.jpg", photos: photos(2), thumb: "" },
    ];
    const main = [...list(chapters).matchAll(/<img[^>]*journey-media__image[^>]*>/g)].map((match) => match[0]);
    expect(main).toHaveLength(4);
    expect(main.filter((tag) => !tag.includes('loading="lazy"'))).toHaveLength(1);
    expect(main[0]).toContain('alt="Alt 0"');
  });

  it("lazy-loads thumbnails, sized for phones and silent for screen readers", () => {
    const out = list([{ ...chapter, photos: photos(1), thumb: "/journey/0.jpg" }]);
    const thumb = /<img[^>]*journey-row__image[^>]*>/.exec(out)?.[0] ?? "";
    expect(thumb).toContain('loading="lazy"');
    expect(thumb).toContain('alt=""');
    expect(thumb).toContain('sizes="(max-width: 960px) 60px, 116px"');
  });

  it("offers flashback buttons only for several photos, and at most four", () => {
    expect(list([{ ...chapter, photos: photos(1) }])).not.toContain("journey-flashbacks");
    const out = list([{ ...chapter, photos: photos(2) }]);
    expect(out.match(/class="journey-flashback"/g)).toHaveLength(2);
    expect(out).toMatch(/aria-pressed="true" aria-label="Photo 1 of 2"/);
    const five: JourneyEntry = { ...JOURNEY_ENTRIES[1], photos: Array.from({ length: 5 }, () => ({ src: "", altKey: "landing.journey.presto.photo1" })) } as JourneyEntry;
    expect(resolveEntries([five], i18n.t)[0]?.photos).toHaveLength(MAX_PHOTOS);
  });
});

describe("the journey stylesheet", () => {
  const css = readFileSync(new URL("./journey.css", import.meta.url), "utf8");
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("scopes every rule under the brand theme", () => {
    for (const [, selector] of rules.matchAll(/(?:^|[{}])\s*([^{}@]+?)\s*\{/g)) {
      for (const part of (selector ?? "").split(",")) expect(part.trim().startsWith('[data-theme="brand"]'), part).toBe(true);
    }
  });

  it("has no hex, shadows, gradients, blur, accent colour or motion", () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(rules).not.toMatch(/box-shadow|text-shadow|gradient|blur|--brand-accent|transition|animation/);
  });
});
