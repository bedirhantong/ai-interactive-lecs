import path from "node:path";
import type { NextConfig } from "next";

// Lesson content lives in the repository-level /content folder, so the
// monorepo root is the project root for tracing and bundling.
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Self-contained server (.next/standalone) for the Docker image.
  output: "standalone",
  poweredByHeader: false,
  // The browser always calls the API on the same origin (/api/...), so session cookies are
  // first-party. In production Caddy routes /api before it reaches Next.js; in development
  // Next.js proxies it to the local API.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_INTERNAL_URL ?? "http://localhost:8000"}/api/:path*` }];
  },
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: { "/**": ["../../content/**/*"] },
  turbopack: {
    root: repoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
