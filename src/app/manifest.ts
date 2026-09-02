import { buildPwaManifest } from "@/lib/pwa-manifest";
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return buildPwaManifest();
}
