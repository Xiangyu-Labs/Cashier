import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const withNextIntl = createNextIntlPlugin();

// Build remotePatterns from environment
const remotePatterns: Array<{ protocol: "https" | "http"; hostname: string }> = [];

const nextConfig: NextConfig = {
  // instrumentation.ts is enabled by default in Next.js 16+
  output: "standalone",
  images: {
    unoptimized: true, // Disable Next.js image optimization - images are pre-processed on upload
    remotePatterns,
  },
};

const withSerwist = withSerwistInit({
  swSrc: "worker/index.ts",
  swDest: "public/sw.js",
  swUrl: "/sw.js",
  cacheOnNavigation: false,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [
    { url: "/zh/offline", revision: null },
    { url: "/en/offline", revision: null },
  ],
  exclude: [
    /middleware-manifest\.json$/,
    /app-build-manifest\.json$/,
    /chunks\/app\/api\//,
    /chunks\/app\/.*\(protected\)\//,
    /chunks\/app\/.*\/login\//,
    /chunks\/app\/.*\/settings\//,
  ],
});

export default withSerwist(withNextIntl(nextConfig));
