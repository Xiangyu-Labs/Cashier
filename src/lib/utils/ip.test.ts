import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ip module boundaries", () => {
  it("keeps header parsing utilities free of next/headers", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/utils/ip.ts"), "utf8");

    expect(source).not.toContain('from "next/headers"');
    expect(source).not.toContain("export async function getClientIP");
  });
});
