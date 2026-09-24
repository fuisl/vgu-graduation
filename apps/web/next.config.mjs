const docsOrigin = (process.env.DOCS_ORIGIN || (process.env.NODE_ENV === "development" ? "http://localhost:3001" : "")).replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ASCIIGen is installed from its private source repository and intentionally
  // ships TypeScript rather than a compiled browser bundle.
  transpilePackages: ["asciify"],
  async rewrites() {
    if (!docsOrigin) return [];

    return [
      { source: "/docs", destination: `${docsOrigin}/docs` },
      { source: "/docs/:path*", destination: `${docsOrigin}/docs/:path*` },
    ];
  },
};

export default nextConfig;
