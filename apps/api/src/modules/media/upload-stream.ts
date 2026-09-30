import type { UploadContentType } from "@grad/contract";
import { Transform, type Readable, type TransformCallback } from "node:stream";

/** Bytes needed to recognise every accepted format (WebP needs 12). */
export const SNIFF_BYTES = 12;

export class UploadTooLargeError extends Error {
  constructor() {
    super("upload exceeds the size limit");
    this.name = "UploadTooLargeError";
  }
}

export class EmptyUploadError extends Error {
  constructor() {
    super("upload is empty");
    this.name = "EmptyUploadError";
  }
}

/**
 * Identifies the image format from its magic bytes. The client's declared
 * content type and file name are never trusted (§4.3).
 */
export function sniffImageType(head: Buffer): UploadContentType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    head.length >= 12 &&
    head.subarray(0, 4).toString("latin1") === "RIFF" &&
    head.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Reads the first `n` bytes of `stream` (fewer if it ends first) and puts them
 * back, so the stream can then be piped from the start. Only the head is held.
 */
export function peekHead(stream: Readable, n: number = SNIFF_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;

    const cleanup = () => {
      stream.off("readable", onReadable);
      stream.off("end", onEnd);
      stream.off("error", onError);
    };
    const finish = (ended: boolean) => {
      cleanup();
      const head = Buffer.concat(chunks);
      if (!ended && head.length > 0) stream.unshift(head);
      resolve(head.subarray(0, n));
    };
    function onReadable() {
      let chunk: Buffer | null;
      while (length < n && (chunk = stream.read() as Buffer | null) !== null) {
        chunks.push(chunk);
        length += chunk.length;
      }
      if (length >= n) finish(false);
    }
    function onEnd() {
      finish(true);
    }
    function onError(err: Error) {
      cleanup();
      reject(err);
    }

    stream.on("readable", onReadable);
    stream.on("end", onEnd);
    stream.on("error", onError);
  });
}

/**
 * Pass-through that counts bytes and fails once more than `maxBytes` flow
 * through it, which aborts the storage upload it feeds. An empty stream fails too.
 */
export class ByteLimit extends Transform {
  bytes = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > this.maxBytes) return callback(new UploadTooLargeError());
    callback(null, chunk);
  }

  override _flush(callback: TransformCallback): void {
    callback(this.bytes === 0 ? new EmptyUploadError() : null);
  }
}
