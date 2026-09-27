import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const docsOrigin = (process.env.DOCS_ORIGIN || (process.env.NODE_ENV === "development" ? "http://localhost:3001" : "")).replace(/\/$/, "");

// ASCIIGen (`asciify`) is a private, optional dependency: only installable
// with GitHub read access to semicolons-dev/asciify (see
// docs/development/private-dependencies.md). Contributors without access
// simply don't get it installed. When it's missing, every import of
// "asciify" is redirected to the local stub below so /ascii-live still
// builds, lints and typechecks; the page itself falls back to a plain
// message at runtime (see AsciiLive.tsx).
const asciifyInstalled = existsSync(path.join(rootDir, "node_modules/asciify"));
const asciifyStubDir = path.join(rootDir, "vendor/asciify-stub");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ASCIIGen ships TypeScript rather than a compiled browser bundle.
  transpilePackages: asciifyInstalled ? ["asciify"] : [],
  webpack(config) {
    if (!asciifyInstalled) config.resolve.alias["asciify"] = asciifyStubDir;
    return config;
  },
  ...(asciifyInstalled ? {} : { turbopack: { resolveAlias: { "asciify/*": "./vendor/asciify-stub/*" } } }),
  async rewrites() {
    if (!docsOrigin) return [];

    return [
      { source: "/docs", destination: `${docsOrigin}/docs` },
      { source: "/docs/:path*", destination: `${docsOrigin}/docs/:path*` },
    ];
  },
};

export default nextConfig;
