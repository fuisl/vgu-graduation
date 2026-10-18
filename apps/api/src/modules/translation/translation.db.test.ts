import type { IngestTranslationSegmentRequest } from "@grad/contract";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";

/**
 * Real-Postgres check of segment storage and the per-language merge rules, in
 * its own scratch database. Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_translation_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let repo: InstanceType<typeof import("./translation.repository.js").TranslationRepository>;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping translation DB tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  await runMigrations(scratchUrl.toString());

  // Same module-cache reset as invitations.db.test.ts.
  process.env.DATABASE_URL = scratchUrl.toString();
  vi.resetModules();
  const dbModule = await import("../../db/index.js");
  const { config: scratchConfig } = await import("../../config.js");
  if (scratchConfig.databaseUrl !== scratchUrl.toString()) {
    throw new Error("refusing to run: the db module is not pointed at the scratch database");
  }
  pool = dbModule.pool;
  const { TranslationRepository } = await import("./translation.repository.js");
  repo = new TranslationRepository();
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

beforeEach(async () => {
  await pool?.query("TRUNCATE translation_segments CASCADE");
});

function segment(sequence: number, translations: IngestTranslationSegmentRequest["translations"]): IngestTranslationSegmentRequest {
  return {
    sessionId: "ceremony",
    sequence,
    startMs: sequence * 1000,
    endMs: sequence * 1000 + 800,
    sourceLanguage: "vi",
    sourceText: `Câu số ${sequence}`,
    translations,
  };
}

describe("TranslationRepository", () => {
  it("stores a segment with its translations in a fixed language order", async (ctx) => {
    if (!admin) return ctx.skip();
    const result = await repo.upsert(
      segment(0, [
        { language: "en", status: "draft", text: "Sentence zero", provider: "mock" },
        { language: "de", status: "failed", text: null, provider: "local-gpu" },
      ]),
    );
    expect(result.changed).toBe(true);
    expect(result.segment).toMatchObject({ sessionId: "ceremony", sequence: 0, sourceText: "Câu số 0" });
    expect(result.segment.translations).toEqual([
      { language: "de", status: "failed", text: null, provider: "local-gpu" },
      { language: "en", status: "draft", text: "Sentence zero", provider: "mock" },
    ]);
  });

  it("upgrades draft to final, lets a retry replace a failure, and never revises a final", async (ctx) => {
    if (!admin) return ctx.skip();
    await repo.upsert(
      segment(1, [
        { language: "en", status: "draft", text: "rough", provider: "mock" },
        { language: "de", status: "failed", text: null, provider: "local-gpu" },
      ]),
    );
    const upgraded = await repo.upsert(
      segment(1, [
        { language: "en", status: "final", text: "Polished", provider: "local-gpu" },
        { language: "de", status: "draft", text: "Satz eins", provider: "local-gpu" },
      ]),
    );
    expect(upgraded.changed).toBe(true);
    expect(upgraded.segment.translations).toEqual([
      { language: "de", status: "draft", text: "Satz eins", provider: "local-gpu" },
      { language: "en", status: "final", text: "Polished", provider: "local-gpu" },
    ]);

    const late = await repo.upsert(
      segment(1, [
        { language: "en", status: "draft", text: "rough again", provider: "mock" },
        { language: "de", status: "failed", text: null, provider: "local-gpu" },
      ]),
    );
    expect(late.changed).toBe(false);
    expect(late.segment.translations).toEqual(upgraded.segment.translations);

    const again = await repo.upsert(segment(1, [{ language: "en", status: "final", text: "Different", provider: "x" }]));
    expect(again.changed).toBe(false);
    expect(again.segment.translations[1].text).toBe("Polished");
  });

  it("never revises the source text and adds later languages to the stored segment", async (ctx) => {
    if (!admin) return ctx.skip();
    await repo.upsert(segment(2, []));
    const later = await repo.upsert({
      ...segment(2, [{ language: "vi", status: "final", text: "Câu số 2", provider: "asr" }]),
      sourceText: "edited",
    });
    expect(later.changed).toBe(true);
    expect(later.segment.sourceText).toBe("Câu số 2");
    expect(later.segment.translations).toHaveLength(1);
    const { rows } = await pool!.query("SELECT count(*)::int AS n FROM translation_segments");
    expect(rows[0].n).toBe(1);
  });

  it("finds what changed after a timestamp, including a late translation of an old segment", async (ctx) => {
    if (!admin) return ctx.skip();
    await repo.upsert(segment(3, [{ language: "en", status: "draft", text: "three", provider: "mock" }]));
    await repo.upsert(segment(4, []));
    const mark = await repo.now();
    await new Promise((r) => setTimeout(r, 5));
    expect(await repo.changesSince(mark, 10)).toEqual([]);

    await repo.upsert(segment(3, [{ language: "en", status: "final", text: "Three", provider: "local-gpu" }]));
    await repo.upsert(segment(5, []));
    const changes = await repo.changesSince(mark, 10);
    expect(changes.map((c) => c.segment.sequence)).toEqual([3, 5]);
    expect(changes[0].segment.translations[0].status).toBe("final");
    expect(changes[0].changedAt.getTime()).toBeGreaterThan(mark.getTime());
    expect(await repo.changesSince(mark, 1)).toHaveLength(1);
  });

  it("returns the newest segments oldest first", async (ctx) => {
    if (!admin) return ctx.skip();
    for (let i = 10; i < 14; i++) await repo.upsert(segment(i, []));
    const recent = await repo.recent(3);
    expect(recent.map((r) => r.segment.sequence)).toEqual([11, 12, 13]);
  });
});
