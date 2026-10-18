import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where a job is in the daemon's hands. The order is the order of the steps:
 *
 *   received    taken from the queue; nothing sent to CUPS yet (safe to redo)
 *   submitting  about to run `lp` / `lp` running; the printer may or may not
 *               have the job (ambiguous after a crash)
 *   printed     CUPS accepted the job
 *   failed      will be reported as failed (error kept)
 *   reported    the API has the outcome; kept only to recognise a re-delivery
 */
export type JournalPhase = "received" | "submitting" | "printed" | "failed" | "reported";

export interface JournalEntry {
  id: string;
  photoPublicId: string;
  copies: number;
  phase: JournalPhase;
  /** Outcome already sent to the API (set with phase `reported`). */
  outcome?: "done" | "failed";
  error?: string;
  updatedAt: string;
}

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * One small JSON file per job under `<stateDir>/journal`, replaced atomically
 * (write a temp file, then rename), so a crash leaves either the old or the new
 * state, never a torn one. This is what makes printing at-most-once per job id
 * across restarts (see README "Idempotency").
 */
export class Journal {
  private readonly dir: string;

  constructor(stateDir: string, private readonly now: () => Date = () => new Date()) {
    this.dir = path.join(stateDir, "journal");
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  private file(id: string) {
    if (!SAFE_ID.test(id)) throw new Error("Refusing a job id that is not a plain identifier");
    return path.join(this.dir, `${id}.json`);
  }

  async get(id: string): Promise<JournalEntry | null> {
    try {
      return JSON.parse(await readFile(this.file(id), "utf8")) as JournalEntry;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async put(entry: Omit<JournalEntry, "updatedAt">): Promise<JournalEntry> {
    const full: JournalEntry = { ...entry, updatedAt: this.now().toISOString() };
    const target = this.file(entry.id);
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(full));
    await rename(tmp, target);
    return full;
  }

  async list(): Promise<JournalEntry[]> {
    const names = (await readdir(this.dir)).filter((n) => n.endsWith(".json")).sort();
    const entries: JournalEntry[] = [];
    for (const name of names) {
      const entry = await this.get(name.slice(0, -".json".length)).catch(() => null);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  /** Entries that still need work: everything not yet reported, oldest first. */
  async unfinished(): Promise<JournalEntry[]> {
    return (await this.list())
      .filter((e) => e.phase !== "reported")
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  }

  /** Deletes reported entries older than `retentionMs`. */
  async prune(retentionMs: number): Promise<number> {
    const cutoff = this.now().getTime() - retentionMs;
    let removed = 0;
    for (const entry of await this.list()) {
      if (entry.phase === "reported" && Date.parse(entry.updatedAt) < cutoff) {
        await rm(this.file(entry.id), { force: true });
        removed += 1;
      }
    }
    return removed;
  }
}
