/*
 * The name badge's printed face, shared by the WebGL card texture (BadgeCanvas) and the CSS
 * card (BadgeFallback), so both print the same thing in the same places. Pure and client-safe:
 * no values from @grad/contract (that would ship zod), no dictionaries. The server builds the
 * card in the page's language (`lib/profile/badge.ts`) and passes it down.
 */

/** What the card prints. Every string is already in the page's language; mono labels are uppercase. */
export type BadgeCard = {
  /** The name the guest is called by, printed large (#170). */
  givenName: string;
  /** The full name, printed below in mono, or null when it is the same as `givenName`. */
  fullName: string | null;
  /** The guest's role on the day ("GUEST"). */
  role: string;
  /** The ceremony date ("21 NOV 2026"), or null while the event is unavailable. */
  date: string | null;
  /** Where ("VGU CAMPUS"). */
  place: string;
  /** A status in the corner ("PREVIEW" on the demo badge), or null. */
  status: string | null;
  /** The owner's line at the foot of the card. */
  tagline: string;
};

/**
 * The pass QR (GET /pass, signed; never the invitation token): the SVG for the CSS card and the
 * "Save badge" download, and the module matrix so the WebGL card can draw it synchronously
 * (no image decode, no tainted canvas). `bits` is `size * size` "0"/"1" characters, row by row.
 */
export type PassArt = { svg: string; size: number; bits: string };

/** The event mark in the card's top corners. Proper nouns: the same in every language. */
export const BADGE_MARK = { left: "VGU", right: "GRAD / 26" } as const;

/** The static ASCII artwork the card shows where the QR goes when there is no pass (the demo badge). */
export const BADGE_ASCII = [
  "         .  :  .         ",
  "      .  :  +  :  .      ",
  "   .  :  +  *  +  :  .   ",
  ".  :  +  *  #  *  +  :  .",
  "   .  :  +  *  +  :  .   ",
  "      .  :  +  :  .      ",
  "         .  :  .         ",
] as const;

/**
 * Layout of the face in texture pixels (1024 x 1454, the card's 2 : 2.84). The CSS card reads the
 * same numbers through `--u` (one texture pixel), so the fallback is a faithful print of the 3D card.
 */
export const FACE = {
  width: 1024,
  height: 1454,
  inset: 70,
  markY: 108,
  qr: { x: 252, y: 262, size: 520 },
  asciiY: 320,
  asciiStep: 91,
  nameBaseline: 1050,
  nameMax: 150,
  nameMin: 72,
  fullNameBaseline: 1118,
  fullNameMax: 32,
  fullNameMin: 22,
  ruleY: 1170,
  rowY: [1235, 1274],
  taglineY: 1380,
} as const;

/** The widest a line may print: the card minus its side insets. */
export const FACE_TEXT_WIDTH = FACE.width - FACE.inset * 2;

/**
 * The largest size from `max` down to `min` at which `text` fits `maxWidth`, else the text cut
 * with an ellipsis at `min`. `measure(text, size)` is the rendered width (canvas `measureText`).
 */
export function fitText(
  measure: (text: string, size: number) => number,
  text: string,
  maxWidth: number,
  max: number,
  min: number,
): { text: string; size: number } {
  for (let size = max; size >= min; size -= 2) {
    if (measure(text, size) <= maxWidth) return { text, size };
  }
  const chars = Array.from(text);
  for (let length = chars.length - 1; length > 0; length -= 1) {
    const cut = `${chars.slice(0, length).join("").trimEnd()}…`;
    if (measure(cut, min) <= maxWidth) return { text: cut, size: min };
  }
  return { text: "…", size: min };
}

/**
 * The given name's size for the CSS card, which cannot measure text: an estimate from the length
 * (Inter Tight averages a little over half an em per character). The card also clips with an ellipsis.
 */
export function estimateNameSize(name: string): number {
  const length = Math.max(1, Array.from(name).length);
  return Math.round(Math.min(FACE.nameMax, Math.max(FACE.nameMin, FACE_TEXT_WIDTH / (length * 0.58))));
}
