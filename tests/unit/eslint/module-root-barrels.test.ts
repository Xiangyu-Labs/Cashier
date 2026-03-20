import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("module root barrel governance", () => {
  it("does not keep src/modules/*/index.ts root barrels", () => {
    const modulesDir = path.join(process.cwd(), "src/modules");
    const moduleDirs = readdirSync(modulesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const rootBarrels = moduleDirs.filter((moduleDir) =>
      existsSync(path.join(modulesDir, moduleDir, "index.ts"))
    );

    expect(rootBarrels).toEqual([]);
  });
});
