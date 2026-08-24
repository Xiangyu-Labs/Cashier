import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function luminance(hex: string): number {
  const channels = hex
    .match(/[\da-f]{2}/gi)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function readTokens(block: string): Map<string, string> {
  return new Map(
    [...block.matchAll(/--(heatmap-(?:[0-5]|text-(?:low|high))):\s*(#[\da-f]{6});/gi)].map(
      ([, name, value]) => [name!, value!] as const
    )
  );
}

describe("heatmap color contrast", () => {
  it("meets WCAG AA for every light and dark heatmap level", () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const darkStart = css.indexOf(".dark {");
    const palettes = [readTokens(css.slice(0, darkStart)), readTokens(css.slice(darkStart))];

    for (const palette of palettes) {
      expect(palette.size).toBe(8);
      for (let level = 0; level <= 5; level += 1) {
        const background = palette.get(`heatmap-${level}`)!;
        const foreground = palette.get(`heatmap-text-${level >= 4 ? "high" : "low"}`)!;
        expect(contrast(background, foreground)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
