import type { MessageId } from "../../lib/i18n/messages/en";

/**
 * The landing's `the-journey/` list: the one file the owner edits for media (docs/design/landing.md,
 * "What the owner fills in"). Words live in lib/i18n/messages/en.ts and vi.ts, under the keys named here.
 *
 * - Photos and posters: put the file in apps/web/public/journey/ and write its path, "/journey/my-photo.jpg".
 *   Journey photos carry a content hash ("01-1a2b3c4d.jpg") so a recrop gets a new URL past the image cache.
 *   Next.js resizes them for phones. Never a remote or stock image.
 * - Leave a path empty ("") and the guest sees a quiet labelled plate instead.
 * - Add or remove a chapter by adding or removing a block below, plus its keys in en.ts and vi.ts.
 * - A chapter shows at most four photos. Filenames stay plain ASCII in both languages, without a number:
 *   the page numbers the rows it shows from 01 (view.ts, numberedFile).
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
    file: "the_film.mp4",
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
    file: "presto.jpg",
    titleKey: "landing.journey.presto.title",
    dateKey: "landing.journey.presto.date",
    storyKey: "landing.journey.presto.story",
    photos: [
      { src: "/journey/presto/01-f9899090.jpg", altKey: "landing.journey.presto.photo1" },
      { src: "/journey/presto/02-28647d54.jpg", altKey: "landing.journey.presto.photo2" },
      { src: "/journey/presto/03-1c792f02.jpg", altKey: "landing.journey.presto.photo3" },
      { src: "/journey/presto/04-1c094d46.jpg", altKey: "landing.journey.presto.photo4" },
    ],
  },
  {
    kind: "photos",
    file: "career_fair.jpg",
    titleKey: "landing.journey.careerFair.title",
    dateKey: "landing.journey.careerFair.date",
    storyKey: "landing.journey.careerFair.story",
    photos: [
      { src: "/journey/career-fair/01-d3497754.jpg", altKey: "landing.journey.careerFair.photo1" },
      { src: "/journey/career-fair/02-d4639b1c.jpg", altKey: "landing.journey.careerFair.photo2" },
      { src: "/journey/career-fair/03-49b079e5.jpg", altKey: "landing.journey.careerFair.photo3" },
      { src: "/journey/career-fair/04-ea2c05e3.jpg", altKey: "landing.journey.careerFair.photo4" },
    ],
  },
  {
    kind: "photos",
    file: "germany.jpg",
    titleKey: "landing.journey.germany.title",
    dateKey: "landing.journey.germany.date",
    storyKey: "landing.journey.germany.story",
    photos: [
      { src: "/journey/germany/01-276c31fc.jpg", altKey: "landing.journey.germany.photo1" },
      { src: "/journey/germany/02-978a3c79.jpg", altKey: "landing.journey.germany.photo2" },
      { src: "/journey/germany/03-99ea5c42.jpg", altKey: "landing.journey.germany.photo3" },
      { src: "/journey/germany/04-1e0844c5.jpg", altKey: "landing.journey.germany.photo4" },
    ],
  },
  {
    kind: "photos",
    file: "friend_group.jpg",
    titleKey: "landing.journey.friends.title",
    dateKey: "landing.journey.friends.date",
    storyKey: "landing.journey.friends.story",
    photos: [
      { src: "/journey/friends/01-4384e087.jpg", altKey: "landing.journey.friends.photo1" },
      { src: "/journey/friends/02-fd0fc211.jpg", altKey: "landing.journey.friends.photo2" },
      { src: "/journey/friends/03-cc6611a6.jpg", altKey: "landing.journey.friends.photo3" },
      { src: "/journey/friends/04-cc135ff5.jpg", altKey: "landing.journey.friends.photo4" },
    ],
  },
  {
    kind: "photos",
    file: "study.jpg",
    titleKey: "landing.journey.study.title",
    dateKey: "landing.journey.study.date",
    storyKey: "landing.journey.study.story",
    photos: [
      { src: "/journey/study/01-f4101de5.jpg", altKey: "landing.journey.study.photo1" },
      { src: "/journey/study/02-d7066a47.jpg", altKey: "landing.journey.study.photo2" },
      { src: "/journey/study/03-eec62832.jpg", altKey: "landing.journey.study.photo3" },
      { src: "/journey/study/04-81442cc2.jpg", altKey: "landing.journey.study.photo4" },
    ],
  },
];
