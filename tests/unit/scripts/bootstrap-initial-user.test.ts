import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("initial user bootstrap", () => {
  it("marks the bootstrapped account as registration-complete", () => {
    const script = readFileSync(path.resolve("scripts/bootstrap-initial-user.mjs"), "utf8");

    expect(script).toContain('"registration_completed_at"');
    expect(script).toContain("VALUES ($1, $2, $3, $4, $3, $3, $3, $3)");
  });
});
