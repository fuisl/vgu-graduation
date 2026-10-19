import type { TranslationSegment, TranslationText } from "@grad/contract";
import type { SegmentChange, TranslationStore } from "./translation.repository.js";

/** Whether an incoming translation replaces the stored one; the same rules as the repository's upsert. */
function replaces(current: TranslationText | undefined, next: TranslationText): boolean {
  if (!current) return true;
  if (current.status === "final") return false;
  if (current.status === "draft" && next.status === "failed") return false;
  return current.status !== next.status || current.text !== next.text || current.provider !== next.provider;
}

/**
 * In-memory TranslationStore for route tests. Its clock starts at `start` and
 * advances a second per write, so watermarks are predictable.
 */
export function fakeTranslationStore(start = new Date("2026-11-20T03:00:00.000Z")) {
  let tick = 0;
  const clock = () => new Date(start.getTime() + tick * 1000);
  const rows = new Map<string, SegmentChange>();
  const calls = { upsert: 0, changesSince: 0, recent: 0, now: 0 };
  let failing = false;

  const ordered = () => [...rows.values()].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  const check = () => {
    if (failing) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  };

  const store: TranslationStore = {
    async upsert(input) {
      calls.upsert++;
      check();
      tick++;
      const key = `${input.sessionId}:${input.sequence}`;
      const existing = rows.get(key)?.segment;
      let changed = existing === undefined;
      const segment: TranslationSegment = existing
        ? { ...existing, translations: [...existing.translations] }
        : { ...input, translations: [] };
      for (const t of input.translations) {
        const i = segment.translations.findIndex((x) => x.language === t.language);
        if (!replaces(segment.translations[i], t)) continue;
        changed = true;
        if (i === -1) segment.translations.push(t);
        else segment.translations[i] = t;
      }
      segment.translations.sort((a, b) => a.language.localeCompare(b.language));
      const changedAt = changed ? clock() : rows.get(key)!.changedAt;
      rows.set(key, { segment, changedAt });
      return { segment, changed, changedAt: clock() };
    },
    async changesSince(since, limit) {
      calls.changesSince++;
      check();
      return ordered()
        .filter((r) => r.changedAt > since)
        .slice(0, limit);
    },
    async recent(limit) {
      calls.recent++;
      check();
      return ordered().slice(-limit);
    },
    async now() {
      calls.now++;
      check();
      return clock();
    },
  };

  return {
    store,
    calls,
    /** Makes every call fail like an unreachable database. */
    fail(value = true) {
      failing = value;
    },
  };
}
