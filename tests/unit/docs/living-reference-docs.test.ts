import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("living reference docs", () => {
  it("keeps only the approved architecture reference docs", () => {
    const architectureDir = path.join(process.cwd(), "docs/architecture");
    const docs = readdirSync(architectureDir).sort();
    expect(docs).toEqual(["PRD.md", "UI.md", "coding-patterns.md"]);
  });

  it("does not keep a docs/guides reference tree", () => {
    expect(existsSync(path.join(process.cwd(), "docs/guides"))).toBe(false);
  });
});
