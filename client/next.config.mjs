import createNextIntlPlugin from "next-intl/plugin";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Desktop build (desktop/ runs the studio inside Electron): a self-contained
// `.next/standalone/server.js`. Opt-in so `next start` (dev, e2e CI) keeps working.
const standalone = process.env.NEXT_OUTPUT === "standalone";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
  // The vendored @devdigest/shared barrel uses NodeNext-style `./contracts/x.js`
  // specifiers for `.ts` files. Type-only imports are erased, but a runtime
  // import (e.g. MEMORY_CONTENT_MAX in MemoryForm) makes webpack resolve them.
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
  ...(standalone && {
    output: "standalone",
    // Pin the trace root to client/ — with lockfiles higher up, Next would
    // otherwise pick an ancestor dir and nest server.js under that path.
    outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
    // src/i18n/request.ts reads messages/ via fs at request time; the tracer
    // can't see a computed path, so ship the folder explicitly.
    outputFileTracingIncludes: { "/**": ["./messages/**/*"] },
  }),
};

export default withNextIntl(nextConfig);
