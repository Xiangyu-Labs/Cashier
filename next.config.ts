import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

// Build remotePatterns from environment
const remotePatterns: Array<{ protocol: "https" | "http"; hostname: string }> = [];

const nextConfig: NextConfig = {
  // instrumentation.ts is enabled by default in Next.js 16+
  images: {
    unoptimized: true, // Disable Next.js image optimization - images are pre-processed on upload
    remotePatterns,
  },
};

import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  cacheStartUrl: false,
  dynamicStartUrl: false,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [],
  },
});

export default withPWA(withNextIntl(nextConfig));
