import { describe, expect, it } from "vitest";
import fullConfig from "../../../vitest.config";
import unitConfig from "../../../vitest.unit.config";

describe("vitest unit config boundaries", () => {
  it("does not include generic tests globs that also match integration files", () => {
    const projects =
      (unitConfig.test?.projects as Array<{ test?: { include?: string[] } }> | undefined) ?? [];
    const includes = projects.flatMap((project) => project.test?.include ?? []);

    expect(includes).not.toContain("tests/**/*.test.ts");
    expect(includes).not.toContain("tests/**/*.test.tsx");
  });

  it("does not reuse the same groupOrder across projects with different maxWorkers", () => {
    const projects =
      (fullConfig.test?.projects as
        | Array<{
            test?: { maxWorkers?: unknown; sequence?: { groupOrder?: number } };
          }>
        | undefined) ?? [];

    const seen = new Map<number, unknown>();

    for (const project of projects) {
      const groupOrder = project.test?.sequence?.groupOrder;
      const maxWorkers = project.test?.maxWorkers;
      if (groupOrder == null) continue;

      if (seen.has(groupOrder)) {
        expect(seen.get(groupOrder)).toEqual(maxWorkers);
      } else {
        seen.set(groupOrder, maxWorkers);
      }
    }
  });
});
