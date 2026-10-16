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
