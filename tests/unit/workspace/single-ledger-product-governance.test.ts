import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("single-ledger product governance", () => {
  it("does not generate ledger route links from the workspace client", () => {
    const source = read("src/modules/workspace/ui/LedgerPageClient.tsx");

    expect(source).not.toContain("/ledger/${");
    expect(source).not.toContain('href: `/ledger/');
  });

  it("does not pass allLedgers into settings", () => {
    const source = read("src/modules/workspace/ui/LedgerPageClient.tsx");

    expect(source).not.toContain("allLedgers");
  });

  it("documents the product as single-ledger", () => {
    const prd = read("docs/architecture/PRD.md");

    expect(prd).toContain("单账本");
    expect(prd).not.toContain("支持多账本隔离");
  });
});
