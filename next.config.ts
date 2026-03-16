import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

// Build remotePatterns from environment
const remotePatterns: Array<{ protocol: "https" | "http"; hostname: string }> = [
  {
    protocol: "https",
    hostname: "*.r2.cloudflarestorage.com",
  },
  {
    protocol: "https",
    hostname: "*.r2.dev",
  },
];

// Add custom R2 public URL if configured
if (process.env.R2_PUBLIC_URL) {
  try {
    const url = new URL(process.env.R2_PUBLIC_URL);
    remotePatterns.push({
      protocol: url.protocol === "https:" ? "https" : "http",
      hostname: url.hostname,
    });
  } catch {
    // Invalid URL, ignore
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@aws-sdk/client-s3"],
  images: {
    unoptimized: process.env.NODE_ENV === "development",
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
