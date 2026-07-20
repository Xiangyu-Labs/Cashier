import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { writePerformanceReport } from "../../../scripts/performance/write-performance-report.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("writePerformanceReport", () => {
  it("does not present bundle candidates as confirmed when the bundle artifact is skipped", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cashier-performance-report-"));
    roots.push(root);

    const { reportPath } = await writePerformanceReport({
      projectRoot: root,
      bundlePath: "missing-bundle.json",
      reportPath: "report.md",
    });
    const report = await readFile(reportPath, "utf8");

    expect(report).toContain(
      "| Default stream client graph | not-observed | Bundle analysis artifact not supplied; no fresh webpack manifest metric is available"
    );
    expect(report).toContain(
      "| Inactive tabs and forms | not-observed | Bundle analysis artifact not supplied; no fresh webpack manifest metric is available"
    );
    expect(report).not.toContain("Default stream client graph | confirmed-build");
    expect(report).not.toContain("Inactive tabs and forms | confirmed-build");
  });
});
