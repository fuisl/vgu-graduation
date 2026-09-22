import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/docs",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  outputFileTracingIncludes: { "/*": ["../../docs/**/*.md"] },
};

export default nextConfig;
