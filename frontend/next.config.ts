import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Emit a fully static site to frontend/out/ for S3 + CloudFront hosting.
  output: "export",

  // Force trailing slashes so URLs map cleanly to S3 keys (e.g. /admin/ → /admin/index.html).
  // Without this, /admin would 404 on S3 because the key is admin/index.html.
  trailingSlash: true,

  // next/image's default loader requires a Node runtime; static export needs the unoptimized loader.
  images: { unoptimized: true },

  turbopack: {
    // Repo root has its own package-lock.json (CDK). Pin the workspace root explicitly.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
