import type {
  GalleryItem,
  LiveDisplayFeedResponse,
  LiveDisplayMessage,
  LiveTranslationMessage,
  LiveTranslationSegmentsResponse,
  TargetLanguage,
  TranslationSegment,
  TranslationText,
  Wish,
} from "@grad/contract";

/*
 * Hand-written guards for the live wire shapes in packages/contract/src/live.ts
 * and translation.ts. The schemas themselves would pull zod (about 100 kB) into
 * the /live and /display bundles, which phones on venue Wi-Fi download; these
 * check the same fields. guards.test.ts keeps them in step with the schemas.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNonEmpty = (v: unknown): v is string => isStr(v) && v.length > 0;
const isInt = (v: unknown, min = 0): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;
const isTimestamp = (v: unknown): v is string => isStr(v) && !Number.isNaN(Date.parse(v)) && /T.*(Z|[+-]\d\d:?\d\d)$/.test(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TARGET_LANGUAGES: readonly TargetLanguage[] = ["de", "en", "vi"];

export function isTargetLanguage(v: unknown): v is TargetLanguage {
  return (TARGET_LANGUAGES as readonly unknown[]).includes(v);
}

function isTranslationText(v: unknown): v is TranslationText {
  if (!isObj(v) || !isTargetLanguage(v.language)) return false;
  if (v.status !== "draft" && v.status !== "final" && v.status !== "failed") return false;
  if (!(v.text === null || isStr(v.text)) || !(v.provider === null || isStr(v.provider))) return false;
  return v.status === "failed" || v.text !== null;
}

export function isTranslationSegment(v: unknown): v is TranslationSegment {
  return (
    isObj(v) &&
    isNonEmpty(v.sessionId) &&
    isInt(v.sequence) &&
    isInt(v.startMs) &&
    isInt(v.endMs) &&
    (v.endMs as number) >= (v.startMs as number) &&
    (v.sourceLanguage === "en" || v.sourceLanguage === "vi") &&
    isNonEmpty(v.sourceText) &&
    Array.isArray(v.translations) &&
    v.translations.every(isTranslationText)
  );
}

function isWish(v: unknown): v is Wish {
  return isObj(v) && isStr(v.id) && UUID.test(v.id) && isStr(v.authorName) && isStr(v.body) && isTimestamp(v.createdAt);
}

function isGalleryItem(v: unknown): v is GalleryItem {
  const dim = (d: unknown) => d === null || isInt(d, 1);
  return isObj(v) && isNonEmpty(v.publicId) && dim(v.width) && dim(v.height) && isTimestamp(v.createdAt);
}

export function isLiveDisplayMessage(v: unknown): v is LiveDisplayMessage {
  if (!isObj(v)) return false;
  switch (v.type) {
    case "wish":
      return isWish(v.wish);
    case "photo":
      return isGalleryItem(v.photo);
    case "segment":
      return isTranslationSegment(v.segment);
    case "hidden":
      return (v.kind === "wish" || v.kind === "photo") && isNonEmpty(v.id);
    case "keepalive":
      return isTimestamp(v.until);
    default:
      return false;
  }
}

export function isLiveDisplayFeedResponse(v: unknown): v is LiveDisplayFeedResponse {
  return isObj(v) && Array.isArray(v.messages) && v.messages.every(isLiveDisplayMessage) && isTimestamp(v.until);
}

const isState = (v: unknown) => v === "live" || v === "unavailable";

export function isLiveTranslationMessage(v: unknown): v is LiveTranslationMessage {
  if (!isObj(v) || !(v.until === undefined || isTimestamp(v.until))) return false;
  if (v.type === "segment") return isTranslationSegment(v.segment);
  if (v.type === "status") return isState(v.state);
  return v.type === "keepalive";
}

export function isLiveTranslationSegmentsResponse(v: unknown): v is LiveTranslationSegmentsResponse {
  return (
    isObj(v) &&
    Array.isArray(v.segments) &&
    v.segments.every(isTranslationSegment) &&
    isTimestamp(v.until) &&
    typeof v.more === "boolean" &&
    isState(v.state)
  );
}

/** The later of two contract timestamps; the cursor (`until`) only moves forward. */
export function laterTimestamp(a: string | null, b: string | undefined): string | null {
  if (b === undefined) return a;
  if (a === null) return b;
  return Date.parse(b) >= Date.parse(a) ? b : a;
}
