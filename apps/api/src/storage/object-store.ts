import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { Readable } from "node:stream";
import type { Config } from "../config.js";

/**
 * Garage (or anything S3-compatible) could not be reached or refused the call.
 * Callers answer 503 so the guest retries later (use-cases.md §6.2); the rest
 * of the API keeps working.
 */
export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("object storage unavailable", { cause });
    this.name = "StorageUnavailableError";
  }
}

/** The object does not exist (S3 `NoSuchKey`). */
export class ObjectNotFoundError extends Error {
  constructor() {
    super("object not found");
    this.name = "ObjectNotFoundError";
  }
}

export interface StoredObject {
  body: Readable;
  contentType: string | undefined;
  contentLength: number | undefined;
}

/** The one storage client the modules share (§4.3). Buckets are passed per call. */
export interface ObjectStore {
  /**
   * Streams `body` into `bucket/key` without holding the whole file in memory:
   * multipart parts of 5 MB, one in flight at a time. Rejects with the body's own
   * error if the stream fails, otherwise with StorageUnavailableError.
   */
  putStream(bucket: string, key: string, body: Readable, contentType: string): Promise<void>;
  put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
  get(bucket: string, key: string): Promise<StoredObject>;
  /** Idempotent: deleting a missing key succeeds. */
  delete(bucket: string, key: string): Promise<void>;
}

/** Bucket names from config, failing clearly when storage isn't configured (a local .env without S3_*). */
export function buckets(config: Config): { originals: string; derivatives: string } {
  const { bucketOriginals, bucketDerivatives } = config.s3;
  if (!bucketOriginals || !bucketDerivatives) {
    throw new StorageUnavailableError(new Error("S3_BUCKET_ORIGINALS or S3_BUCKET_DERIVATIVES is not set"));
  }
  return { originals: bucketOriginals, derivatives: bucketDerivatives };
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NoSuchKey" || e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
}

/**
 * S3 client for Garage: path-style addressing, short timeouts so a down Garage
 * fails an upload in seconds instead of hanging the guest's request.
 */
export class S3ObjectStore implements ObjectStore {
  private client: S3Client | undefined;

  constructor(private readonly config: Config) {}

  private s3(): S3Client {
    if (this.client) return this.client;
    const { endpoint, region, accessKeyId, secretAccessKey } = this.config.s3;
    if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
      throw new StorageUnavailableError(new Error("S3_* variables are not set"));
    }
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 2,
      // Garage doesn't return the checksums newer SDKs compute and validate by default.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      requestHandler: { connectionTimeout: 3_000, requestTimeout: 30_000 },
    });
    return this.client;
  }

  async putStream(bucket: string, key: string, body: Readable, contentType: string): Promise<void> {
    const client = this.s3();
    let bodyError: unknown;
    body.once("error", (err) => {
      bodyError = err;
    });
    try {
      await new Upload({
        client,
        params: { Bucket: bucket, Key: key, Body: body, ContentType: contentType },
        partSize: 5 * 1024 * 1024,
        queueSize: 1,
        leavePartsOnError: false,
      }).done();
    } catch (err) {
      // A failing body (too large, not an image) is the caller's error, not storage's.
      if (bodyError) throw bodyError;
      throw new StorageUnavailableError(err);
    }
  }

  async put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.s3().send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    } catch (err) {
      if (err instanceof StorageUnavailableError) throw err;
      throw new StorageUnavailableError(err);
    }
  }

  async get(bucket: string, key: string): Promise<StoredObject> {
    try {
      const out = await this.s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return {
        body: out.Body as Readable,
        contentType: out.ContentType,
        contentLength: out.ContentLength,
      };
    } catch (err) {
      if (err instanceof StorageUnavailableError) throw err;
      if (isNotFound(err)) throw new ObjectNotFoundError();
      throw new StorageUnavailableError(err);
    }
  }

  async delete(bucket: string, key: string): Promise<void> {
    try {
      await this.s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      if (err instanceof StorageUnavailableError) throw err;
      if (isNotFound(err)) return;
      throw new StorageUnavailableError(err);
    }
  }
}
