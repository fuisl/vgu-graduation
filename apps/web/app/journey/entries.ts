import type { MessageId } from "../../lib/i18n/messages/en";

/**
 * The landing's `the-journey/` list: the one file the owner edits for media (docs/design/landing.md,
 * "What the owner fills in"). Words live in lib/i18n/messages/en.ts and vi.ts, under the keys named here.
 *
 * - Photos and posters: put the file in apps/web/public/journey/ and write its path, "/journey/my-photo.jpg".
 *   Next.js resizes them for phones. Never a remote or stock image.
 * - Leave a path empty ("") and the guest sees a quiet labelled plate instead.
 * - Add or remove a chapter by adding or removing a block below, plus its keys in en.ts and vi.ts.
 * - A chapter shows at most four photos. Filenames stay plain ASCII in both languages.
 */

/** One photo in a chapter. */
export type JourneyPhoto = {
  /** "/journey/my-photo.jpg", or "" until the photo exists. */
  src: string;
  /** What the photo shows, for guests who cannot see it. */
  altKey: MessageId;
};

type JourneyWords = {
  /** The row's label: plain ASCII, never translated. */
  file: string;
  titleKey: MessageId;
  /** The mono line under the title: date and place, or the film's length. */
  dateKey: MessageId;
  /** The story. A blank line in the message starts a new paragraph. */
  storyKey: MessageId;
};

export type JourneyFilm = JourneyWords & {
  kind: "video";
  /** Full URL of the video file, or "" until it exists. */
  src: string;
  /** "/journey/film-poster.jpg", or "". Shown until the guest presses play. */
  poster: string;
  /** Names the player for screen readers. */
  altKey: MessageId;
  /** WebVTT files in apps/web/public/journey/, on this site's own host so the browser may read them. */
  captions: { en: string; vi: string };
};

export type JourneyChapter = JourneyWords & {
  kind: "photos";
  photos: JourneyPhoto[];
};

export type JourneyEntry = JourneyFilm | JourneyChapter;

export const JOURNEY_ENTRIES: JourneyEntry[] = [
  {
    kind: "video",
    file: "01_the_film.mp4",
    titleKey: "landing.journey.film.title",
    dateKey: "landing.journey.film.date",
    storyKey: "landing.journey.film.story",
    // TODO(owner): hosting is undecided. Set the video URL here; no video files in the repo.
    src: "",
    // TODO(owner): add the poster image and both caption files.
    poster: "",
    altKey: "landing.journey.film.alt",
    captions: { en: "", vi: "" },
  },
  {
    kind: "photos",
    file: "02_[first_year].jpg",
    titleKey: "landing.journey.firstYear.title",
    dateKey: "landing.journey.firstYear.date",
    storyKey: "landing.journey.firstYear.story",
    // TODO(owner): add the photos for this chapter (the same for the three chapters below).
    photos: [
      { src: "", altKey: "landing.journey.firstYear.photo1" },
      { src: "", altKey: "landing.journey.firstYear.photo2" },
      { src: "", altKey: "landing.journey.firstYear.photo3" },
      { src: "", altKey: "landing.journey.firstYear.photo4" },
    ],
  },
  {
    kind: "photos",
    file: "03_[second_year].jpg",
    titleKey: "landing.journey.secondYear.title",
    dateKey: "landing.journey.secondYear.date",
    storyKey: "landing.journey.secondYear.story",
    photos: [
      { src: "", altKey: "landing.journey.secondYear.photo1" },
      { src: "", altKey: "landing.journey.secondYear.photo2" },
      { src: "", altKey: "landing.journey.secondYear.photo3" },
    ],
  },
  {
    kind: "photos",
    file: "04_[third_year].jpg",
    titleKey: "landing.journey.thirdYear.title",
    dateKey: "landing.journey.thirdYear.date",
    storyKey: "landing.journey.thirdYear.story",
    photos: [
      { src: "", altKey: "landing.journey.thirdYear.photo1" },
      { src: "", altKey: "landing.journey.thirdYear.photo2" },
      { src: "", altKey: "landing.journey.thirdYear.photo3" },
      { src: "", altKey: "landing.journey.thirdYear.photo4" },
    ],
  },
  {
    kind: "photos",
    file: "05_[final_year].jpg",
    titleKey: "landing.journey.finalYear.title",
    dateKey: "landing.journey.finalYear.date",
    storyKey: "landing.journey.finalYear.story",
    photos: [
      { src: "", altKey: "landing.journey.finalYear.photo1" },
      { src: "", altKey: "landing.journey.finalYear.photo2" },
    ],
  },
];
