import { describe, expect, it } from "vitest";
import config from "../../../vitest.unit.config";

describe("vitest unit config boundaries", () => {
  it("does not include generic tests globs that also match integration files", () => {
    const projects =
      (config.test?.projects as Array<{ test?: { include?: string[] } }> | undefined) ?? [];
    const includes = projects.flatMap((project) => project.test?.include ?? []);

    expect(includes).not.toContain("tests/**/*.test.ts");
    expect(includes).not.toContain("tests/**/*.test.tsx");
  });
});
