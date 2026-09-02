import { buildPwaManifest } from "@/lib/pwa-manifest";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> }
): Promise<Response> {
  const candidate = (await params).locale;
  const locale = candidate === "en" ? "en" : "zh";
  return Response.json(buildPwaManifest(locale), {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
