import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV === "development";

// Use cwd instead of __dirname so the config loads cleanly under both CJS and ESM
// resolution paths (Next sometimes falls back to ESM compilation when native SWC fails).
const projectRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  // Static export only in production builds. Vercel hosts the exported frontend
  // while AWS continues to provide the backend APIs and presigned S3 upload flow.
  // Dev mode runs full Next.js so .dev route files can serve locally.
  ...(isDev ? {} : { output: "export" }),

  // Keep page URLs canonical and compatible with the existing exported route shape.
  trailingSlash: true,

  // next/image's default loader requires a Node runtime; static export needs the unoptimized loader.
  images: { unoptimized: true },

  // Production build: only `.ts/.tsx` count as routes — `.dev.ts/.dev.tsx` files are ignored.
  // Dev mode (`next dev`): include `.dev.ts/.dev.tsx` so the admin API route works locally.
  pageExtensions: isDev
    ? ["ts", "tsx", "dev.ts", "dev.tsx"]
    : ["ts", "tsx"],

  turbopack: {
    // Repo root has its own package-lock.json (CDK). Pin the workspace root explicitly.
    root: projectRoot,
  },
};

export default nextConfig;
