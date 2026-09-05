import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("frontend motion policy", () => {
  it("keeps broad transitions and exaggerated hover scale out of interactive surfaces", () => {
    const files = [
      "src/components/ui/button.tsx",
      "src/components/ui/calculator-input.tsx",
      "src/components/ui/editable-field.tsx",
      "src/modules/auth/ui/otp-input.tsx",
      "src/modules/source-document/ui/EditableLedgerEntryItem.tsx",
      "src/modules/source-document/ui/LedgerEntryItem.tsx",
      "src/modules/source-document/ui/SourceDocumentViewDetails.tsx",
      "src/modules/stats/ui/StatsChart.tsx",
      "src/modules/stats/ui/StatsRanking.tsx",
    ];
    const source = files.map(read).join("\n");
    expect(source).not.toContain("transition-all");
    expect(source).not.toMatch(/hover:scale-(?:110|125|\[1\.[1-9])/);
  });

  it("does not reintroduce nested layout animation in ledger lists", () => {
    const source = [
      read("src/modules/workspace/ui/UnifiedStreamGroups.tsx"),
      read("src/modules/workspace/ui/DetailsTab.tsx"),
    ].join("\n");
    expect(source).not.toContain("AnimatePresence");
    expect(source).not.toMatch(/\blayout(?:=|\s)/);
  });
});
