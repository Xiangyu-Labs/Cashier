import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { legacyUnitTestAllowlist } from "../../tooling/legacy-unit-test-allowlist";

function walk(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (/\.test\.(ts|tsx)$/.test(entry.name)) {
      files.push(path.relative(process.cwd(), fullPath).replace(/\\/g, "/"));
    }
  }

  return files;
}

describe("unit test location governance", () => {
  it("allows legacy module-owned unit tests only via the explicit grandfathered allowlist", () => {
    const allUnitTests = walk(path.join(process.cwd(), "tests/unit"));
    const legacyModuleTests = allUnitTests.filter((file) =>
      /^tests\/unit\/(auth|currency|hooks|ledger|source-document|stats|task-queue|workspace)\//.test(
        file
      )
    );

    expect(legacyModuleTests.sort()).toEqual(legacyUnitTestAllowlist.slice().sort());
  });
});
