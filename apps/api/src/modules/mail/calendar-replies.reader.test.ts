import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImapMailboxReader } from "./calendar-replies.js";
import type { Config } from "../../config.js";

/** A stand-in for ImapFlow: a real EventEmitter, so an unheard "error" throws as the real one does. */
class FakeImap extends EventEmitter {
  static last: FakeImap;
  mailbox = { uidValidity: 7n, uidNext: 43 };
  lockOptions: unknown;
  released = false;
  connect = vi.fn(async () => {});
  logout = vi.fn(async () => {});
  close = vi.fn();
  search = vi.fn(async () => [42]);
  getMailboxLock = vi.fn(async (_mailbox: string, options: unknown) => {
    this.lockOptions = options;
    return { release: () => void (this.released = true) };
  });
  downloadMany = vi.fn(async () => ({ "2": { content: Buffer.from("BEGIN:VCALENDAR") } }));
  async *fetch() {
    yield {
      uid: 42,
      envelope: { from: [{ address: "Guest@Example.com" }] },
      headers: Buffer.from("Authentication-Results: mx.google.com; dmarc=pass\r\n"),
      bodyStructure: {
        type: "multipart/mixed",
        childNodes: [
          { type: "text/plain", part: "1", size: 10 },
          { type: "text/calendar", part: "2", size: 100 },
        ],
      },
    };
  }
  constructor() {
    super();
    FakeImap.last = this;
  }
}

vi.mock("imapflow", () => ({ ImapFlow: vi.fn(() => new FakeImap()) }));

const MAIL = { imapHost: "imap.example.com", imapPort: 993, user: "me@example.com", password: "secret" } as Config["mail"];

describe("ImapMailboxReader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads new messages' calendar parts from a read-only mailbox, then lets go of it", async () => {
    const result = await new ImapMailboxReader(MAIL).read({ uidValidity: 7, lastUid: 41 }, new Date());
    expect(result).toEqual({
      uidValidity: 7,
      uidNext: 43,
      messages: [{ uid: 42, from: "guest@example.com", authenticationResults: "mx.google.com; dmarc=pass", calendarParts: ["BEGIN:VCALENDAR"] }],
    });
    expect(FakeImap.last.lockOptions).toEqual({ readOnly: true });
    expect(FakeImap.last.downloadMany).toHaveBeenCalledWith("42", ["2"], { uid: true });
    expect(FakeImap.last.released).toBe(true);
    expect(FakeImap.last.logout).toHaveBeenCalled();
  });

  it("survives a socket error with the listener attached, logging its code and nothing else", async () => {
    const warn = vi.fn();
    const reader = new ImapMailboxReader(MAIL, { warn });
    await reader.read({ uidValidity: 7, lastUid: 41 }, new Date());
    const socketError = Object.assign(new Error("dropped while reading mail for guest@example.com"), { code: "ECONNRESET" });
    expect(() => FakeImap.last.emit("error", socketError)).not.toThrow();
    expect(warn).toHaveBeenCalledWith({ error: "ECONNRESET" }, "calendar reply mailbox connection error");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("guest@example.com");
  });

  it("survives an error during connect, and the read rejects for the poller to retry", async () => {
    const { ImapFlow } = await import("imapflow");
    vi.mocked(ImapFlow).mockImplementationOnce(() => {
      const client = new FakeImap();
      client.connect = vi.fn(async () => {
        client.emit("error", Object.assign(new Error("socket"), { code: "ETIMEDOUT" }));
        throw Object.assign(new Error("connect failed"), { code: "ETIMEDOUT" });
      });
      return client as never;
    });
    await expect(new ImapMailboxReader(MAIL).read(null, new Date())).rejects.toThrow("connect failed");
  });
});
