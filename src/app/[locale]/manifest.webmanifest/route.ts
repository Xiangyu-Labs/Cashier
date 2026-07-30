import type { MetadataRoute } from "next";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> }
): Promise<Response> {
  const candidate = (await params).locale;
  const locale = candidate === "en" ? "en" : "zh";
  const zh = locale === "zh";
  const manifest: MetadataRoute.Manifest = {
    name: zh ? "Cashier - AI 记账助手" : "Cashier - AI Bookkeeping",
    short_name: "Cashier",
    description: zh ? "AI 驱动的智能记账工具" : "AI-powered bookkeeping",
    start_url: `/${locale}/offline`,
    scope: `/${locale}/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#10a37f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
  return Response.json(manifest, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
