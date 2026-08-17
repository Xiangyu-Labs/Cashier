import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ActiveShell tab surface lifetime", () => {
  it("does not key the swipe surface by active tab", () => {
    const source = readFileSync("src/app/[locale]/(protected)/_active-shell.tsx", "utf8");

    expect(source).not.toMatch(/<SwipeTabSurface[\s\S]*?key=\{activeTab\}/);
  });
});
