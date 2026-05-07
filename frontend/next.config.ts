import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV === "development";

// Use cwd instead of __dirname so the config loads cleanly under both CJS and ESM
// resolution paths (Next sometimes falls back to ESM compilation when native SWC fails).
const projectRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  // Emit a fully static site to frontend/out/ for S3 + CloudFront hosting.
  output: "export",

  // Force trailing slashes so URLs map cleanly to S3 keys (e.g. /admin/ → /admin/index.html).
  // Without this, /admin would 404 on S3 because the key is admin/index.html.
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
