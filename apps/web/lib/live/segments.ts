import type { TargetLanguage, TranslationSegment, TranslationText } from "@grad/contract";

/** Segments a phone keeps (and renders). Older ones scroll off, so the DOM stays bounded over a three-hour ceremony. */
export const MAX_SEGMENTS = 300;

export function segmentKey(segment: Pick<TranslationSegment, "sessionId" | "sequence">): string {
  return `${segment.sessionId}:${segment.sequence}`;
}

const RANK: Record<TranslationText["status"], number> = { draft: 0, failed: 1, final: 2 };

/**
 * Per language, a later message replaces an earlier one unless it would go
 * backwards: a `final` is never replaced by a late `draft` (the socket and the
 * catch-up fetch can deliver the same segment in either order).
 */
export function mergeTranslations(current: readonly TranslationText[], incoming: readonly TranslationText[]): TranslationText[] {
  const byLanguage = new Map<TargetLanguage, TranslationText>();
  for (const t of current) byLanguage.set(t.language, t);
  for (const t of incoming) {
    const existing = byLanguage.get(t.language);
    if (!existing || RANK[t.status] >= RANK[existing.status]) byLanguage.set(t.language, t);
  }
  return [...byLanguage.values()];
}

/**
 * Inserts or updates one segment, idempotently by (sessionId, sequence). The
 * list stays in spoken order: sessions in the order they were first seen,
 * sequences ascending within a session. Trims the oldest past `max`.
 */
export function mergeSegment(
  list: readonly TranslationSegment[],
  segment: TranslationSegment,
  max = MAX_SEGMENTS,
): TranslationSegment[] {
  const key = segmentKey(segment);
  const index = list.findIndex((s) => segmentKey(s) === key);
  let next: TranslationSegment[];
  if (index >= 0) {
    const existing = list[index]!;
    next = [...list];
    next[index] = { ...segment, translations: mergeTranslations(existing.translations, segment.translations) };
  } else {
    next = [...list];
    let at = next.length;
    const first = next.findIndex((s) => s.sessionId === segment.sessionId);
    if (first >= 0) {
      // A backfill can arrive after later live lines: slot it in after the last earlier sequence.
      at = first;
      next.forEach((s, i) => {
        if (s.sessionId === segment.sessionId && s.sequence < segment.sequence) at = i + 1;
      });
    }
    next.splice(at, 0, segment);
  }
  return next.length > max ? next.slice(next.length - max) : next;
}

export function mergeSegments(
  list: readonly TranslationSegment[],
  segments: readonly TranslationSegment[],
  max = MAX_SEGMENTS,
): TranslationSegment[] {
  let next = [...list];
  for (const segment of segments) next = mergeSegment(next, segment, max);
  return next;
}

export type CaptionTone = "final" | "draft" | "failed" | "pending";

export interface Caption {
  key: string;
  /** Text to show; for `pending`, the source sentence while the translation is on its way. */
  text: string;
  /** Language of `text`, for the `lang` attribute. */
  language: TargetLanguage;
  tone: CaptionTone;
}

/**
 * What one segment shows in `language`. The spoken language needs no
 * translation; a missing translation shows the source text, styled as pending;
 * `failed` says so for that line and never blocks the others.
 */
export function captionFor(segment: TranslationSegment, language: TargetLanguage): Caption {
  const key = segmentKey(segment);
  const source = segment.sourceLanguage as TargetLanguage;
  if (segment.sourceLanguage === language) return { key, text: segment.sourceText, language, tone: "final" };
  const translation = segment.translations.find((t) => t.language === language);
  if (!translation) return { key, text: segment.sourceText, language: source, tone: "pending" };
  if (translation.status === "failed" || translation.text === null) {
    return { key, text: segment.sourceText, language: source, tone: "failed" };
  }
  return { key, text: translation.text, language, tone: translation.status };
}
