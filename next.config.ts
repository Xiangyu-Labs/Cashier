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
  images: {
    unoptimized: process.env.NODE_ENV === "development",
    remotePatterns,
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
