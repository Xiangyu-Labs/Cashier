import { existsSync, readFileSync, readdirSync } from "node:fs";
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

  it("does not keep manual environment variable sections in README or CLAUDE", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    const claude = readFileSync(path.join(process.cwd(), "CLAUDE.md"), "utf8");

    expect(readme).not.toMatch(/^### Environment Variables$/m);
    expect(claude).not.toMatch(/^### Environment Variables$/m);
  });
});
