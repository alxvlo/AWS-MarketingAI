import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Needed because the repo root also has a package-lock.json (CDK monorepo layout).
    // Without this, Next.js 16 warns about ambiguous workspace root detection.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
