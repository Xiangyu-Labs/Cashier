import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("mobile long-flow dialog policy", () => {
  it.each([
    "src/modules/source-document/ui/SourceDocumentEditRetryDialog.tsx",
    "src/modules/source-document/ui/SourceDocumentReviewDialogContent.tsx",
    "src/modules/workspace/ui/NewRecordDialog.tsx",
    "src/modules/auth/ui/CredentialChangeDialog.tsx",
  ])("uses a 100dvh mobile surface in %s", (path) => {
    const source = read(path);
    expect(source).toContain("h-[100dvh]");
    expect(source).toContain("sm:");
  });

  it("uses the shared mobile shell for both source-document review dialogs", () => {
    for (const path of [
      "src/modules/source-document/ui/SourceDocumentCandidateReviewDialog.tsx",
      "src/modules/source-document/ui/SourceDocumentDuplicateReviewDialog.tsx",
    ]) {
      expect(read(path)).toContain("SourceDocumentReviewDialogContent");
    }
  });

  it.each([
    ["src/modules/ledger/ui/LedgerEntryDetailModal.tsx", "sm:max-w-lg"],
    ["src/modules/source-document/ui/SourceDocumentDetailModal.tsx", "sm:max-w-2xl"],
  ])("lets the shared detail variant own mobile sizing in %s", (path, desktopWidth) => {
    const source = read(path);
    expect(source).toContain('variant="detail"');
    expect(source).toContain(desktopWidth);
    expect(source).not.toContain("h-[100dvh]");
    expect(read("src/components/ui/dialog.tsx")).toContain(
      "inset-0 h-[100dvh] w-screen max-w-none rounded-none"
    );
  });

  it("uses a full-bleed mobile image canvas and a constrained desktop viewer", () => {
    const imageViewer = read("src/modules/source-document/ui/SourceDocumentImageModal.tsx");
    const dialog = read("src/components/ui/dialog.tsx");
    expect(dialog).toContain("viewer:");
    expect(dialog).toContain("h-[100dvh]");
    expect(dialog).toContain("sm:h-[90dvh]");
    expect(dialog).toContain("sm:w-[95vw]");
    expect(imageViewer).toContain("overflow-hidden sm:p-4");
    expect(imageViewer).toContain("border-0 p-0 shadow-none");
  });

  it("keeps mobile close controls touch-sized and account dialogs safely scrollable", () => {
    const dialog = read("src/components/ui/dialog.tsx");
    expect(dialog).toContain("size-11");
    for (const path of ["src/modules/auth/ui/CredentialChangeDialog.tsx"]) {
      const source = read(path);
      expect(source).toContain("min-h-0 flex-1");
      expect(source).toContain("overflow-y-auto");
      expect(source).toContain("env(safe-area-inset-bottom)");
    }
  });
});
