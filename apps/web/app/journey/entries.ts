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
    file: "02_presto.jpg",
    titleKey: "landing.journey.presto.title",
    dateKey: "landing.journey.presto.date",
    storyKey: "landing.journey.presto.story",
    photos: [
      { src: "/journey/presto/01.jpg", altKey: "landing.journey.presto.photo1" },
      { src: "/journey/presto/02.jpg", altKey: "landing.journey.presto.photo2" },
      { src: "/journey/presto/03.jpg", altKey: "landing.journey.presto.photo3" },
      { src: "/journey/presto/04.jpg", altKey: "landing.journey.presto.photo4" },
    ],
  },
  {
    kind: "photos",
    file: "03_career_fair.jpg",
    titleKey: "landing.journey.careerFair.title",
    dateKey: "landing.journey.careerFair.date",
    storyKey: "landing.journey.careerFair.story",
    photos: [
      { src: "/journey/career-fair/01.jpg", altKey: "landing.journey.careerFair.photo1" },
      { src: "/journey/career-fair/02.jpg", altKey: "landing.journey.careerFair.photo2" },
      { src: "/journey/career-fair/03.jpg", altKey: "landing.journey.careerFair.photo3" },
      { src: "/journey/career-fair/04.jpg", altKey: "landing.journey.careerFair.photo4" },
    ],
  },
  {
    kind: "photos",
    file: "04_germany.jpg",
    titleKey: "landing.journey.germany.title",
    dateKey: "landing.journey.germany.date",
    storyKey: "landing.journey.germany.story",
    photos: [
      { src: "/journey/germany/01.jpg", altKey: "landing.journey.germany.photo1" },
      { src: "/journey/germany/02.jpg", altKey: "landing.journey.germany.photo2" },
      { src: "/journey/germany/03.jpg", altKey: "landing.journey.germany.photo3" },
      { src: "/journey/germany/04.jpg", altKey: "landing.journey.germany.photo4" },
    ],
  },
  {
    kind: "photos",
    file: "05_friend_group.jpg",
    titleKey: "landing.journey.friends.title",
    dateKey: "landing.journey.friends.date",
    storyKey: "landing.journey.friends.story",
    photos: [
      { src: "/journey/friends/01.jpg", altKey: "landing.journey.friends.photo1" },
      { src: "/journey/friends/02.jpg", altKey: "landing.journey.friends.photo2" },
      { src: "/journey/friends/03.jpg", altKey: "landing.journey.friends.photo3" },
      { src: "/journey/friends/04.jpg", altKey: "landing.journey.friends.photo4" },
    ],
  },
  {
    kind: "photos",
    file: "06_study.jpg",
    titleKey: "landing.journey.study.title",
    dateKey: "landing.journey.study.date",
    storyKey: "landing.journey.study.story",
    photos: [
      { src: "/journey/study/01.jpg", altKey: "landing.journey.study.photo1" },
      { src: "/journey/study/02.jpg", altKey: "landing.journey.study.photo2" },
      { src: "/journey/study/03.jpg", altKey: "landing.journey.study.photo3" },
      { src: "/journey/study/04.jpg", altKey: "landing.journey.study.photo4" },
    ],
  },
];
