import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

/** ADR-018: without this, a save or a navigation can hang on "Saving..." until the guest reloads. */
describe("the React that Next bundles", () => {
  it.each(["production", "development"])("records a wake-up that arrives during a render (%s)", (build) => {
    const file = require.resolve(`next/dist/compiled/react-dom/cjs/react-dom-client.${build}.js`);
    const source = readFileSync(file, "utf8").replace(/\s+/g, " ");
    const ping = source.slice(source.indexOf("function pingSuspendedRoot("), source.indexOf("function retryTimedOutBoundary("));
    const notInRender = String.raw`(?:0 === \(executionContext & 2\)|\(executionContext & RenderContext\) === NoContext)`;
    expect(ping).toMatch(new RegExp(String.raw`\? ${notInRender} \? prepareFreshStack\(root, 0\) : \(workInProgressRootPingedLanes \|= pingedLanes\)`));
  });
});
