import type { MetadataRoute } from "next";

const icons: MetadataRoute.Manifest["icons"] = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
];

export function buildPwaManifest(locale?: "en" | "zh"): MetadataRoute.Manifest {
  const localized = locale != null;
  const zh = locale !== "en";

  return {
    name: zh ? "Cashier - AI 记账助手" : "Cashier - AI Bookkeeping",
    short_name: "Cashier",
    description: zh ? "AI 驱动的智能记账工具" : "AI-powered bookkeeping",
    start_url: localized ? `/${locale}` : "/",
    ...(localized ? { scope: `/${locale}/` } : {}),
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#10a37f",
    icons,
  };
}
