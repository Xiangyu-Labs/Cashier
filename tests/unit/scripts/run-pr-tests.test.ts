import { describe, expect, it } from "vitest";
import { isDocumentationOnly } from "../../../scripts/run-pr-tests.mjs";

describe("PR integration selection", () => {
  it("skips only nonempty documentation-only changes", () => {
    expect(
      isDocumentationOnly([
        "docs/architecture/testing.md",
        "README.zh.md",
        "CONTRIBUTING.md",
        "AGENTS.md",
      ])
    ).toBe(true);
  });
  it.each([
    [],
    ["src/modules/ledger/contracts.ts"],
    ["docs/readme.md", "src/deleted.ts"],
    ["package.json"],
    ["scripts/run-pr-tests.mjs"],
    ["tests/unit/example.test.ts"],
    ["src/README.md"],
  ])("runs full integration for %j", (...files) => {
    expect(isDocumentationOnly(files)).toBe(false);
  });
});
