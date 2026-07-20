import { gzipSync } from "node:zlib";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ManifestAnalysisError,
  analyzeClientBundle,
} from "../../../scripts/performance/analyze-client-bundle.mjs";

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "cashier-bundle-"));
  roots.push(root);
  const next = path.join(root, ".next");
  await mkdir(path.join(next, "server/app/[locale]/(protected)"), { recursive: true });
  await mkdir(path.join(next, "static/chunks"), { recursive: true });
  await writeFile(path.join(next, "BUILD_ID"), "fixture-build\n");

  const chunks = ["shell.custom-name.js", "shared.js", "details.opaque.js", "stats.chunk.js", "forms.js", "modal.js", "settings.js"];
  for (const chunk of chunks) await writeFile(path.join(next, "static/chunks", chunk), `contents:${chunk}`);

  const clientModules = {
    "/work/src/components/providers.tsx": { chunks: ["static/chunks/shell.custom-name.js"] },
    "/work/src/modules/workspace/ui/LedgerPageClient.tsx": {
      chunks: ["static/chunks/shell.custom-name.js", "static/chunks/shared.js"],
    },
  };
  const clientReference = `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[\"/[locale]/(protected)/page\"]=${JSON.stringify({ clientModules })};`;
  await writeFile(path.join(next, "server/app/[locale]/(protected)/page_client-reference-manifest.js"), clientReference);
  await writeFile(path.join(next, "react-loadable-manifest.json"), JSON.stringify({
    "LedgerPageClient -> @/modules/workspace/ui/DetailsTab": { files: ["static/chunks/shared.js", "static/chunks/details.opaque.js"] },
    "LedgerPageClient -> @/modules/workspace/ui/StatsTab": { files: ["static/chunks/stats.chunk.js"] },
    "LedgerPageClient -> @/modules/ledger/ui": { files: ["static/chunks/settings.js"] },
    "LedgerPageClient -> @/modules/source-document/ui": { files: ["static/chunks/forms.js"] },
    "LedgerPageClient -> @/components/providers/ModalStackRenderer": { files: ["static/chunks/modal.js"] },
  }));
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("analyzeClientBundle", () => {
  it("deduplicates chunks and calculates raw and gzip byte metrics without hash assumptions", async () => {
    const root = await fixture();
    const result = await analyzeClientBundle({ projectRoot: root });
    const metrics = result.metrics as Record<
      string,
      { status: string; chunks: Array<{ path: string }>; gzipBytes: number }
    >;
    const defaultStream = metrics.defaultStream!;
    const inactiveTabs = metrics.inactiveTabs!;
    const environmentValidation = metrics.environmentValidation!;

    expect(result.schemaVersion).toBe(1);
    expect(defaultStream.chunks.map((chunk) => chunk.path)).toEqual([
      "static/chunks/shared.js",
      "static/chunks/shell.custom-name.js",
    ]);
    expect(inactiveTabs.chunks).toHaveLength(4);
    expect(inactiveTabs.chunks.filter((chunk) => chunk.path === "static/chunks/shared.js")).toHaveLength(1);
    const shell = await import("node:fs/promises").then(({ readFile }) => readFile(path.join(root, ".next/static/chunks/shell.custom-name.js")));
    expect(defaultStream.gzipBytes).toBeGreaterThanOrEqual(gzipSync(shell).byteLength);
    expect(environmentValidation.status).toBe("not-observed");
  });

  it("fails clearly when a required manifest is missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cashier-bundle-empty-"));
    roots.push(root);
    await expect(analyzeClientBundle({ projectRoot: root })).rejects.toBeInstanceOf(ManifestAnalysisError);
    await expect(analyzeClientBundle({ projectRoot: root })).rejects.toThrow("Missing client-reference manifest");
  });
});
