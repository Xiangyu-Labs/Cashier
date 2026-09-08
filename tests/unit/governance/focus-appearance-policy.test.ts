import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".css", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

describe("focus appearance policy", () => {
  it("uses a compact keyboard-only focus indicator as the global fallback", () => {
    const globals = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
    expect(globals).toContain("):focus-visible {");
    expect(globals).toContain("outline: 2px solid var(--ring);");
    expect(globals).toContain("outline-offset: -2px;");
  });

  it("does not reintroduce forced, oversized, or outward-offset focus rings", () => {
    const source = sourceFiles(resolve(root, "src"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/\bfocus:(?:outline|ring)/);
    expect(source).not.toMatch(/focus-visible:ring-(?:3|4|\[3px\])/);
    expect(source).not.toContain("focus-visible:ring-offset");
  });

  it("keeps broad card controls focused while marking compact internal targets", () => {
    const cardHeader = readFileSync(
      resolve(root, "src/modules/source-document/ui/SourceDocumentCardHeader.tsx"),
      "utf8"
    );
    const selectableCard = readFileSync(
      resolve(root, "src/components/selectable-card-surface.tsx"),
      "utf8"
    );

    expect(cardHeader).toContain("group-focus-visible:outline-2");
    expect(selectableCard).toContain("group-focus-visible:outline-2");
  });
});
