import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import { ByteLimit, EmptyUploadError, peekHead, sniffImageType, UploadTooLargeError } from "./upload-stream.js";

describe("sniffImageType", () => {
  it("recognises JPEG, PNG and WebP from their magic bytes", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(sniffImageType(Buffer.from("89504e470d0a1a0a00000000", "hex"))).toBe("image/png");
    expect(sniffImageType(Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBP", "latin1"))).toBe("image/webp");
  });

  it("rejects everything else, including other RIFF files and HEIC", () => {
    expect(sniffImageType(Buffer.from("RIFF\u0000\u0000\u0000\u0000WAVE", "latin1"))).toBeNull();
    expect(sniffImageType(Buffer.from("\u0000\u0000\u0000\u0018ftypheic", "latin1"))).toBeNull();
    expect(sniffImageType(Buffer.from("GIF89a......", "latin1"))).toBeNull();
    expect(sniffImageType(Buffer.from("<svg xmlns=", "latin1"))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe("peekHead", () => {
  it("reads the head across small chunks and leaves the stream whole", async () => {
    const bytes = Buffer.from("0123456789abcdefghij");
    const stream = Readable.from([bytes.subarray(0, 3), bytes.subarray(3, 7), bytes.subarray(7)], { objectMode: false });
    const head = await peekHead(stream, 12);
    expect(head.toString()).toBe("0123456789ab");
    const rest: Buffer[] = [];
    for await (const chunk of stream) rest.push(chunk as Buffer);
    expect(Buffer.concat(rest).equals(bytes)).toBe(true);
  });

  it("returns what there is when the stream is shorter than the head", async () => {
    expect((await peekHead(Readable.from([Buffer.from("abc")]), 12)).toString()).toBe("abc");
    expect((await peekHead(Readable.from([]), 12)).length).toBe(0);
  });
});

describe("ByteLimit", () => {
  it("passes bytes through and counts them", async () => {
    const limit = new ByteLimit(10);
    const out: Buffer[] = [];
    await pipeline(Readable.from([Buffer.from("hello"), Buffer.from("world")]), limit, async (source) => {
      for await (const chunk of source) out.push(chunk as Buffer);
    });
    expect(Buffer.concat(out).toString()).toBe("helloworld");
    expect(limit.bytes).toBe(10);
  });

  it("fails one byte over the limit, and on an empty stream", async () => {
    const drain = async (source: AsyncIterable<unknown>) => {
      for await (const _ of source);
    };
    await expect(pipeline(Readable.from([Buffer.alloc(11)]), new ByteLimit(10), drain)).rejects.toBeInstanceOf(
      UploadTooLargeError,
    );
    await expect(pipeline(Readable.from([]), new ByteLimit(10), drain)).rejects.toBeInstanceOf(EmptyUploadError);
  });
});
