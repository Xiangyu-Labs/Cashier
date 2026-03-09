import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

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

export default withPWA(withNextIntl(nextConfig));
