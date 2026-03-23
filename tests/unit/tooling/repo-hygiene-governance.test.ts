import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("repo hygiene governance", () => {
  it("does not keep deprecated module entry files", () => {
    const root = process.cwd();
    const forbiddenFiles = [
      "src/modules/auth/helpers.ts",
      "src/modules/currency/services.ts",
      "src/modules/workspace/contracts.ts",
      "src/modules/currency/useConvertedAmount.ts",
      "src/modules/currency/useAmountDisplay.ts",
    ];

    const existing = forbiddenFiles.filter((file) => existsSync(path.join(root, file)));
    expect(existing).toEqual([]);
  });

  it("does not keep empty placeholder component directories", () => {
    const root = process.cwd();
    const forbiddenDirs = ["src/components/auth", "src/components/entries", "src/components/stats"];

    const existing = forbiddenDirs.filter((dir) => existsSync(path.join(root, dir)));
    expect(existing).toEqual([]);
  });
});
