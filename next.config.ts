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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "worker/index.ts",
  swDest: "public/sw.js",
  swUrl: "/sw.js",
  cacheOnNavigation: false,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  exclude: [/middleware-manifest\.json$/, /app-build-manifest\.json$/, /chunks\/app\/api\//],
});

export default withSerwist(withNextIntl(nextConfig));
