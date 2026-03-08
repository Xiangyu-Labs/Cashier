import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import withBundleAnalyzer from '@next/bundle-analyzer';

const withNextIntl = createNextIntlPlugin();
const withBundleAnalyzerConfig = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  output: "standalone",
};

import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true, // Enable caching on frontend navigation
  aggressiveFrontEndNavCaching: true, // Aggressively cache frontend navigation
  reloadOnOnline: false, // Don't force reload when coming back online
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true, // Disable dev logs in production
    importScripts: ["/push-worker.js"],
  },
});

export default withBundleAnalyzerConfig(withPWA(withNextIntl(nextConfig)));
