import { Readable } from "node:stream";
import { ObjectNotFoundError, type ObjectStore, StorageUnavailableError } from "./object-store.js";

/** In-memory ObjectStore for tests. `down = true` makes every call fail like an unreachable Garage. */
export function fakeObjectStore() {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const state = { down: false };
  const k = (bucket: string, key: string) => `${bucket}/${key}`;
  const check = () => {
    if (state.down) throw new StorageUnavailableError(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
  };

  const store: ObjectStore = {
    async putStream(bucket, key, body, contentType) {
      const chunks: Buffer[] = [];
      // Consume first, like the real client does while it streams parts; a body error wins.
      for await (const chunk of body) chunks.push(chunk as Buffer);
      check();
      objects.set(k(bucket, key), { body: Buffer.concat(chunks), contentType });
    },
    async put(bucket, key, body, contentType) {
      check();
      objects.set(k(bucket, key), { body, contentType });
    },
    async get(bucket, key) {
      check();
      const obj = objects.get(k(bucket, key));
      if (!obj) throw new ObjectNotFoundError();
      return { body: Readable.from([obj.body]), contentType: obj.contentType, contentLength: obj.body.length };
    },
    async delete(bucket, key) {
      check();
      objects.delete(k(bucket, key));
    },
  };
  return { store, objects, state };
}
