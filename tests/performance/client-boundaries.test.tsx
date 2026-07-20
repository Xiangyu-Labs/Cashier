import { afterAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { recordPerformanceFindings } from "tests/helpers/performance-observation";

describe("ledger client feature boundaries", () => {
  it("keeps deferred tabs, forms, and modal rendering behind dynamic import boundaries", async () => {
    const source = await readFile(path.resolve("src/modules/workspace/ui/LedgerPageClient.tsx"), "utf8");

    for (const modulePath of [
      "@/modules/workspace/ui/LedgerEntriesTab",
      "@/modules/workspace/ui/DetailsTab",
      "@/modules/workspace/ui/StatsTab",
      "@/modules/ledger/ui",
      "@/modules/source-document/ui",
      "@/components/providers/ModalStackRenderer",
    ]) {
      expect(source).toContain(`import(\"${modulePath}\")`);
    }
    expect(source).toContain("const LedgerEntriesTab = dynamic(");
    expect(source).toContain("const SourceDocumentInput = dynamic(");
    expect(source).toContain("const ModalStackRenderer = dynamic(");
  });
});

afterAll(async () => {
  await recordPerformanceFindings([
    {
      id: "client-dynamic-feature-boundaries",
      category: "structural",
      evidenceClass: "confirmed-structural",
      title: "Deferred workspace features use dynamic import boundaries",
      summary: "Tabs, source-document forms, and the modal renderer are declared through dynamic imports; this confirms a module boundary, not browser download timing or cache behavior.",
      location: "tests/performance/client-boundaries.test.tsx",
    },
  ]);
});
