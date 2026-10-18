import type { IngestTranslationSegmentRequest, TranslationSegment, TranslationText } from "@grad/contract";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { translationSegments, translationTexts } from "../../db/schema.js";

/** A segment with the database time of its latest change (stored, or a translation added or upgraded). */
export interface SegmentChange {
  segment: TranslationSegment;
  changedAt: Date;
}

export interface UpsertResult extends SegmentChange {
  /** False when the post changed nothing: a retry, a draft after its final, or a final re-sent. */
  changed: boolean;
}

/** What the translation module needs from storage. Fakes implement it in tests. */
export interface TranslationStore {
  /**
   * Stores a segment (its source text is never revised once stored) and merges
   * its translations per language: anything replaces a draft or a failure,
   * except that a failure doesn't replace a usable draft; a final is never
   * revised. Returns the merged segment.
   */
  upsert(segment: IngestTranslationSegmentRequest): Promise<UpsertResult>;
  /** Segments whose latest change is after `since`, oldest change first, at most `limit`. */
  changesSince(since: Date, limit: number): Promise<SegmentChange[]>;
  /** The newest `limit` segments by latest change, oldest first. */
  recent(limit: number): Promise<SegmentChange[]>;
  /** Database clock, so every watermark compares against the same clock as the rows. */
  now(): Promise<Date>;
}

type SegmentRow = typeof translationSegments.$inferSelect;
type TextRow = typeof translationTexts.$inferSelect;

/** Fixed order, so a merged segment always serializes the same way. */
const LANGUAGE_ORDER = { de: 0, en: 1, vi: 2 } as const;

function toText(row: TextRow): TranslationText {
  return { language: row.language, status: row.status, text: row.text, provider: row.provider };
}

function toSegment(row: SegmentRow, texts: TextRow[]): TranslationSegment {
  return {
    sessionId: row.sessionId,
    sequence: row.sequence,
    startMs: row.startMs,
    endMs: row.endMs,
    sourceLanguage: row.sourceLanguage,
    sourceText: row.sourceText,
    translations: texts
      .sort((a, b) => LANGUAGE_ORDER[a.language] - LANGUAGE_ORDER[b.language])
      .map(toText),
  };
}

/** Latest change of a segment: when it was stored or when one of its translations last moved. */
const changedAtExpr = sql<Date>`greatest(${translationSegments.createdAt}, coalesce(max(${translationTexts.updatedAt}), ${translationSegments.createdAt}))`;

export class TranslationRepository implements TranslationStore {
  async upsert(input: IngestTranslationSegmentRequest): Promise<UpsertResult> {
    // One language once per statement: the last entry for a language wins.
    const byLanguage = new Map(input.translations.map((t) => [t.language, t]));

    return db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(translationSegments)
        .values({
          sessionId: input.sessionId,
          sequence: input.sequence,
          startMs: input.startMs,
          endMs: input.endMs,
          sourceLanguage: input.sourceLanguage,
          sourceText: input.sourceText,
        })
        .onConflictDoNothing({ target: [translationSegments.sessionId, translationSegments.sequence] })
        .returning();
      const row =
        inserted ??
        (
          await tx
            .select()
            .from(translationSegments)
            .where(
              and(eq(translationSegments.sessionId, input.sessionId), eq(translationSegments.sequence, input.sequence)),
            )
        )[0];
      let changed = inserted !== undefined;

      for (const t of byLanguage.values()) {
        const moved = await tx
          .insert(translationTexts)
          .values({ segmentId: row.id, language: t.language, status: t.status, text: t.text, provider: t.provider })
          .onConflictDoUpdate({
            target: [translationTexts.segmentId, translationTexts.language],
            set: {
              status: sql`excluded.status`,
              text: sql`excluded.text`,
              provider: sql`excluded.provider`,
              updatedAt: sql`now()`,
            },
            // A final is never revised; a failure never hides a draft; identical re-posts are no-ops.
            setWhere: sql`${translationTexts.status} <> 'final'
              AND NOT (${translationTexts.status} = 'draft' AND excluded.status = 'failed')
              AND (${translationTexts.status}, ${translationTexts.text}, ${translationTexts.provider})
                IS DISTINCT FROM (excluded.status, excluded.text, excluded.provider)`,
          })
          .returning({ id: translationTexts.id });
        if (moved.length > 0) changed = true;
      }

      const texts = await tx.select().from(translationTexts).where(eq(translationTexts.segmentId, row.id));
      const { rows } = await tx.execute<{ now: Date | string }>(sql`SELECT now() AS now`);
      // now() is the transaction's start: the same value every row above was stamped with.
      return { segment: toSegment(row, texts), changed, changedAt: new Date(rows[0].now) };
    });
  }

  async changesSince(since: Date, limit: number): Promise<SegmentChange[]> {
    const rows = await db
      .select({ segment: translationSegments, changedAt: changedAtExpr })
      .from(translationSegments)
      .leftJoin(translationTexts, eq(translationTexts.segmentId, translationSegments.id))
      .groupBy(translationSegments.id)
      .having(sql`${changedAtExpr} > ${since.toISOString()}`)
      .orderBy(asc(changedAtExpr), asc(translationSegments.sessionId), asc(translationSegments.sequence))
      .limit(limit);
    return this.withTexts(rows);
  }

  async recent(limit: number): Promise<SegmentChange[]> {
    const rows = await db
      .select({ segment: translationSegments, changedAt: changedAtExpr })
      .from(translationSegments)
      .leftJoin(translationTexts, eq(translationTexts.segmentId, translationSegments.id))
      .groupBy(translationSegments.id)
      .orderBy(sql`${changedAtExpr} DESC`, sql`${translationSegments.sequence} DESC`)
      .limit(limit);
    return (await this.withTexts(rows)).reverse();
  }

  async now(): Promise<Date> {
    const { rows } = await db.execute<{ now: Date | string }>(sql`SELECT now() AS now`);
    return new Date(rows[0].now);
  }

  private async withTexts(rows: { segment: SegmentRow; changedAt: Date | string }[]): Promise<SegmentChange[]> {
    if (rows.length === 0) return [];
    const texts = await db
      .select()
      .from(translationTexts)
      .where(inArray(translationTexts.segmentId, rows.map((r) => r.segment.id)));
    const bySegment = new Map<string, TextRow[]>();
    for (const t of texts) bySegment.set(t.segmentId, [...(bySegment.get(t.segmentId) ?? []), t]);
    return rows.map((r) => ({
      segment: toSegment(r.segment, bySegment.get(r.segment.id) ?? []),
      changedAt: new Date(r.changedAt),
    }));
  }
}
