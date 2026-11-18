import { describe, expect, it } from "vitest";
import { createI18n } from "../../lib/i18n/dictionary";
import { en } from "../../lib/i18n/messages/en";
import { vi } from "../../lib/i18n/messages/vi";
import { JOURNEY_ENTRIES } from "./entries";
import { isPlaceholder, numberedFile, readyEntries, resolveEntries, type JourneyEntryView } from "./view";

const film: JourneyEntryView = {
  file: "the_film.mp4",
  title: "The film",
  date: "4 min · English and Vietnamese captions",
  story: "Four years in four minutes.",
  video: { src: "https://media.example/film.mp4", poster: "", label: "A short film about our class", captions: { en: "", vi: "" } },
  photos: [],
  thumb: "",
};

const chapter: JourneyEntryView = {
  file: "first_year.jpg",
  title: "First year",
  date: "2022, Binh Duong",
  story: "We met.",
  video: null,
  photos: [
    { src: "", alt: "[What photo 1 of this chapter shows.]" },
    { src: "/journey/b.jpg", alt: "The dorm" },
    { src: "/journey/c.jpg", alt: "[What photo 3 of this chapter shows.]" },
  ],
  thumb: "",
};

describe("placeholders never render", () => {
  it("treats empty and bracketed values as placeholders", () => {
    expect(isPlaceholder("")).toBe(true);
    expect(isPlaceholder("   ")).toBe(true);
    expect(isPlaceholder("[Date, place]")).toBe(true);
    expect(isPlaceholder("[Length] · English and Vietnamese captions")).toBe(true);
    expect(isPlaceholder("02_[first_year].jpg")).toBe(true);
    expect(isPlaceholder("Four years, one evening.")).toBe(false);
  });

  it("hides the shipped lead in both languages until the owner writes it", () => {
    expect(isPlaceholder(en["landing.lead"])).toBe(true);
    expect(isPlaceholder(vi["landing.lead"])).toBe(true);
  });

  it("shows only the chapters whose story is written, numbered from 01, in both languages", () => {
    for (const locale of ["en", "vi"] as const) {
      const ready = readyEntries(resolveEntries(JOURNEY_ENTRIES, createI18n(locale).t));
      expect(ready.map((entry) => entry.file)).toEqual(["01_presto.jpg", "02_career_fair.jpg", "03_germany.jpg"]);
      for (const entry of ready) expect(entry.photos).toHaveLength(4);
    }
  });

  it("numbers rows in the order guests see them", () => {
    expect(numberedFile(0, "presto.jpg")).toBe("01_presto.jpg");
    expect(numberedFile(9, "study.jpg")).toBe("10_study.jpg");
    expect(readyEntries([{ ...film, video: { ...film.video!, src: "" } }, chapter]).map((entry) => entry.file)).toEqual(["01_first_year.jpg"]);
  });

  it("keeps a film once its words and video exist", () => {
    expect(readyEntries([film])).toEqual([{ ...film, file: "01_the_film.mp4" }]);
    expect(readyEntries([{ ...film, video: { ...film.video!, src: "" } }])).toEqual([]);
    expect(readyEntries([{ ...film, video: { ...film.video!, label: "[What the film is.]" } }])).toEqual([]);
    expect(readyEntries([{ ...film, date: "[Length] · captions" }])).toEqual([]);
  });

  it("keeps only the photos that exist and are described, and drops a chapter with none", () => {
    const [ready] = readyEntries([chapter]);
    expect(ready?.photos).toEqual([{ src: "/journey/b.jpg", alt: "The dorm" }]);
    expect(ready?.thumb).toBe("/journey/b.jpg");
    expect(readyEntries([{ ...chapter, photos: [{ src: "", alt: "Empty" }] }])).toEqual([]);
    expect(readyEntries([{ ...chapter, file: "[first_year].jpg" }])).toEqual([]);
    expect(readyEntries([{ ...chapter, story: "" }])).toEqual([]);
  });
});
