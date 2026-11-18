/**
 * Word filter for wishes (ADR-019). A small, conservative built-in blocklist of
 * English and Vietnamese slurs and profanity, matched as whole words, plus a
 * spam rule for anonymous posts (no links with a scheme). It is a speed bump in
 * front of moderation, not a replacement: anything it misses is hidden by an
 * admin afterwards (principles.md §8).
 *
 * Conservative on purpose: a false positive blocks a family member's wish on
 * graduation day, so only words with no common innocent reading are listed.
 * Never log the text this rejects.
 */

/**
 * Matched after case folding and with diacritics removed (đ → d), so
 * "FUCK", "Địt mẹ" and the toneless "dit me" all match. Only entries whose
 * toneless spelling has no everyday innocent meaning belong here.
 * Multi-word entries match consecutive words.
 */
const FOLDED_TERMS = [
  // English profanity
  "fuck",
  "fucks",
  "fucked",
  "fucker",
  "fuckers",
  "fucking",
  "fuckin",
  "motherfucker",
  "motherfuckers",
  "fck",
  "fuk",
  "shit",
  "shits",
  "shitty",
  "bullshit",
  "bitch",
  "bitches",
  "cunt",
  "cunts",
  "asshole",
  "assholes",
  "twat",
  "wanker",
  "whore",
  "whores",
  "slut",
  "sluts",
  // English slurs
  "nigger",
  "niggers",
  "nigga",
  "niggas",
  "faggot",
  "faggots",
  "retard",
  "retards",
  "retarded",
  "kike",
  "kikes",
  // Vietnamese phrases whose toneless form is still unambiguous
  "dit me",
  "dit mia",
  "dit con me",
  "djt",
  "djt me",
  // Vietnamese chat abbreviations of the above
  "dcm",
  "dkm",
  "dmm",
  "dcmm",
  "vcl",
  "vkl",
];

/**
 * Vietnamese words matched only with their diacritics (case folded, Unicode
 * normalized). Without tones they collide with ordinary words: "đĩ" folds to
 * "di" (to go), "lồn" to "lon" (a can), "cặc" to "cac" (plural marker).
 */
const EXACT_TERMS = [
  "địt",
  "đụ",
  "đĩ",
  "lồn",
  "cặc",
  "buồi",
  "đéo",
];

/** A link with a scheme (`https://`, `http://`, `ftp://`, …) or `www.`: spam in anonymous wishes. */
const LINK = /\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.[a-z0-9-]/i;

/** Lowercase, NFC; keeps diacritics. */
function exactForm(text: string): string {
  return text.normalize("NFC").toLocaleLowerCase("vi");
}

/** Lowercase with every combining mark removed and đ → d. */
function foldedForm(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

function words(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function compile(terms: string[], form: (s: string) => string): string[][] {
  return terms.map((t) => words(form(t)));
}

const FOLDED = compile(FOLDED_TERMS, foldedForm);
const EXACT = compile(EXACT_TERMS, exactForm);

function containsPhrase(haystack: string[], phrases: string[][]): boolean {
  for (let i = 0; i < haystack.length; i++) {
    for (const phrase of phrases) {
      if (phrase.length === 0 || i + phrase.length > haystack.length) continue;
      let match = true;
      for (let j = 0; j < phrase.length; j++) {
        if (haystack[i + j] !== phrase[j]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
  }
  return false;
}

/** Whether `text` contains a blocked word or phrase (whole words only). */
export function containsBlockedWord(text: string): boolean {
  return containsPhrase(words(foldedForm(text)), FOLDED) || containsPhrase(words(exactForm(text)), EXACT);
}

/** Whether `text` contains a link with a scheme or a `www.` address. */
export function containsLink(text: string): boolean {
  return LINK.test(text);
}

export interface WordFilterOptions {
  /** Anonymous posts may not contain links (spam). */
  blockLinks: boolean;
}

/**
 * True when every given text may be posted. Pass the wish body and the author
 * name: a name is shown on the event display too.
 */
export function isAllowed(texts: (string | undefined)[], options: WordFilterOptions): boolean {
  for (const text of texts) {
    if (!text) continue;
    if (containsBlockedWord(text)) return false;
    if (options.blockLinks && containsLink(text)) return false;
  }
  return true;
}
