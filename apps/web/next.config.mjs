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
  // PUBLIC_API_ORIGIN is intentionally public. Expose the same configured host
  // to browser code for direct photo uploads and derivative image requests.
  env: {
    NEXT_PUBLIC_API_ORIGIN:
      process.env.PUBLIC_API_ORIGIN ||
      (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "https://api.grad26.fuisloy.dev"),
  },
  // Inline each page's CSS into its HTML instead of 3 to 4 render-blocking <link>s (#78, P2-19).
  // Every page is rendered per request (ADR-010), so the HTML was never cached anyway; it costs
  // about 9 kB gzipped (50 kB raw) per page and saves those round trips on venue networks. Lab, 390px,
  // 150ms RTT, 1.6 Mbps, 4x CPU: LCP / 968 -> 364ms, /venue 996 -> 356ms, /me 1144 -> 356ms.
  // Production builds only; experimental in Next 15, so delete this line if it misbehaves.
  experimental: { inlineCss: true },
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
