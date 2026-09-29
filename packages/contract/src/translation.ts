import { z } from "zod";

/** Spoken languages the ceremony pipeline accepts (experimental, #18). */
export const sourceLanguageSchema = z.enum(["en", "vi"]);
export type SourceLanguage = z.infer<typeof sourceLanguageSchema>;

/** Languages captions can be shown in. */
export const targetLanguageSchema = z.enum(["de", "en", "vi"]);
export type TargetLanguage = z.infer<typeof targetLanguageSchema>;

/**
 * One translation of a segment. `draft` is fast and replaceable by a later
 * `final` for the same language; `failed` renders as "translation unavailable"
 * and never blocks other languages. `provider` names the backend (local GPU or
 * cloud) so providers stay swappable.
 */
export const translationTextSchema = z
  .object({
    language: targetLanguageSchema,
    status: z.enum(["draft", "final", "failed"]),
    text: z.string().nullable(),
    provider: z.string().nullable(),
  })
  .refine((t) => t.status === "failed" || t.text !== null, {
    message: "text is required unless status is failed",
    path: ["text"],
  });
export type TranslationText = z.infer<typeof translationTextSchema>;

/** A finalized source sentence with whatever translations exist so far. `sequence` is gapless per session. */
export const translationSegmentSchema = z
  .object({
    sessionId: z.string().min(1),
    sequence: z.number().int().min(0),
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    sourceLanguage: sourceLanguageSchema,
    sourceText: z.string().min(1),
    translations: z.array(translationTextSchema),
  })
  .refine((s) => s.endMs >= s.startMs, { message: "endMs must not precede startMs", path: ["endMs"] });
export type TranslationSegment = z.infer<typeof translationSegmentSchema>;

/**
 * POST /internal/translation/segments (service token `translation`). Idempotent
 * per (sessionId, sequence, language): re-posting upgrades a draft to final and
 * lets later translations attach to an already-stored segment.
 */
export const ingestTranslationSegmentRequestSchema = translationSegmentSchema;
export type IngestTranslationSegmentRequest = z.infer<typeof ingestTranslationSegmentRequestSchema>;

/** GET /live/translation/segments?sessionId=&after=: what a client missed while disconnected. */
export const translationBacklogQuerySchema = z.object({
  sessionId: z.string().min(1),
  after: z.coerce.number().int().min(-1).default(-1),
});
export type TranslationBacklogQuery = z.infer<typeof translationBacklogQuerySchema>;

export const translationBacklogResponseSchema = z.object({
  segments: z.array(translationSegmentSchema),
});
export type TranslationBacklogResponse = z.infer<typeof translationBacklogResponseSchema>;
