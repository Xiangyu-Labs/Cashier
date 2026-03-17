import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

// Build remotePatterns from environment
const remotePatterns: Array<{ protocol: "https" | "http"; hostname: string }> = [];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [],
  // instrumentation.ts is enabled by default in Next.js 16+
  images: {
    unoptimized: true, // Disable Next.js image optimization - images are pre-processed on upload
    remotePatterns,
    // Cache optimized images for 1 year (they include hash in URL)
    minimumCacheTTL: 31536000,
    // Device sizes for responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    // Image formats (prefer WebP, AVIF as alternative)
    formats: ["image/webp"],
    // Disable dangerous SVG optimization (security)
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    importScripts: ["/push-worker.js"],
  },
});

export default withPWA(withNextIntl(nextConfig));
