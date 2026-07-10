import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const API_V1_DIR = path.join(process.cwd(), "src/app/api/v1");

describe("api/v1 public contract - only write endpoints remain", () => {
  it("categories route directory does not exist", () => {
    expect(fs.existsSync(path.join(API_V1_DIR, "categories/route.ts"))).toBe(false);
  });

  it("entries route directory does not exist", () => {
    expect(fs.existsSync(path.join(API_V1_DIR, "entries/route.ts"))).toBe(false);
  });

  it("stats route directory does not exist", () => {
    expect(fs.existsSync(path.join(API_V1_DIR, "stats/route.ts"))).toBe(false);
  });

  it("source-documents route exists and exports POST but not GET", () => {
    const sourcePath = path.join(API_V1_DIR, "source-documents/route.ts");
    expect(fs.existsSync(sourcePath)).toBe(true);
    const source = fs.readFileSync(sourcePath, "utf8");
    expect(source).toContain("export async function POST");
    expect(source).not.toContain("export async function GET");
  });
});
