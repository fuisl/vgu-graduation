import { describe, expect, it } from "vitest";
import {
  TEXT_SIZES,
  TEXT_SIZE_ATTRIBUTE,
  TEXT_SIZE_BOOT_SCRIPT,
  TEXT_SIZE_STORAGE_KEY,
  applyTextSize,
  parseTextSize,
} from "./text-size";

function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    removeAttribute: (name: string) => void attrs.delete(name),
  } as unknown as Element & { attrs: Map<string, string> };
}

describe("parseTextSize", () => {
  it("accepts the known sizes and falls back to default", () => {
    for (const size of TEXT_SIZES) expect(parseTextSize(size)).toBe(size);
    expect(parseTextSize(null)).toBe("default");
    expect(parseTextSize("huge")).toBe("default");
    expect(parseTextSize(2)).toBe("default");
  });
});

describe("applyTextSize", () => {
  it("sets the attribute for larger sizes and removes it for default", () => {
    const root = fakeRoot();
    applyTextSize(root, "largest");
    expect(root.attrs.get(TEXT_SIZE_ATTRIBUTE)).toBe("largest");
    applyTextSize(root, "default");
    expect(root.attrs.has(TEXT_SIZE_ATTRIBUTE)).toBe(false);
  });
});

describe("TEXT_SIZE_BOOT_SCRIPT", () => {
  function run(stored: string | null, throws = false) {
    const root = fakeRoot();
    const localStorage = {
      getItem: (key: string) => {
        if (throws) throw new Error("blocked");
        return key === TEXT_SIZE_STORAGE_KEY ? stored : null;
      },
    };
    new Function("localStorage", "document", TEXT_SIZE_BOOT_SCRIPT)(localStorage, { documentElement: root });
    return root.attrs.get(TEXT_SIZE_ATTRIBUTE);
  }

  it("applies a stored larger size before paint", () => {
    expect(run("large")).toBe("large");
    expect(run("largest")).toBe("largest");
  });

  it("ignores missing or unknown values and blocked storage", () => {
    expect(run(null)).toBeUndefined();
    expect(run("<script>")).toBeUndefined();
    expect(run("large", true)).toBeUndefined();
  });
});
