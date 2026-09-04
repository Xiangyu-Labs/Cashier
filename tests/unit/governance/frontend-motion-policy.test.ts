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

  it("keeps the client runtime free of framer-motion", () => {
    const source = [
      read("package.json"),
      read("src/components/providers.tsx"),
      read("src/modules/source-document/ui/SourceDocumentCard.tsx"),
      read("src/modules/ledger/ui/batch-action-toolbar/LedgerEntriesBatchActionToolbar.tsx"),
      read("src/modules/workspace/ui/SwipeTabSurface.tsx"),
    ].join("\n");
    expect(source).not.toContain("framer-motion");
  });

  it("uses the shared group header across ledger list views", () => {
    expect(read("src/modules/workspace/ui/unified-stream/group-header.tsx")).toContain(
      "<EntryGroupHeader"
    );
    expect(read("src/modules/ledger/ui/LedgerEntryGroupsView.tsx")).toContain("<EntryGroupHeader");
    expect(read("src/modules/workspace/ui/DetailsTabView.tsx")).toContain("<LedgerEntryGroupsView");
  });
});
