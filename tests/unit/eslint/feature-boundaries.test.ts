import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

async function lintRestrictedImports(code: string, filePath: string) {
  const eslint = new ESLint({
    overrideConfigFile: `${process.cwd()}/eslint.config.mjs`,
  });

  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === "no-restricted-imports");
}

describe("boundary lint", () => {
  it("rejects cross-feature deep imports from feature server files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getSourceDocumentsAction } from "@/features/source-document/server/actions/queries";
        export const leak = getSourceDocumentsAction;
      `,
      "src/features/ledger/server/tasks/categorize-entry.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects deep feature imports from shared library files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getSourceDocumentsAction } from "@/features/source-document/server/actions/queries";
        export const leak = getSourceDocumentsAction;
      `,
      "src/lib/error-handlers.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects persistence imports from app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { ledgers } from "@/persistence";
        export const leak = ledgers;
      `,
      "src/app/api/v1/entries/route.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects module server-action deep imports from shared library files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getLedgerEntriesAction } from "@/modules/ledger/server-actions/entries";
        export const leak = getLedgerEntriesAction;
      `,
      "src/lib/error-handlers.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects workspace application deep imports from app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getLedgerPageBootstrap } from "@/modules/workspace/application/queries/get-ledger-page-bootstrap";
        export const leak = getLedgerPageBootstrap;
      `,
      "src/app/[locale]/(protected)/ledger/[id]/page.tsx"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects cross-module server-action deep imports from module files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getSourceDocumentsAction } from "@/modules/source-document/server-actions/queries";
        export const leak = getSourceDocumentsAction;
      `,
      "src/modules/ledger/contracts.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows auth constants imports from app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { OTP_LENGTH } from "@/modules/auth/constants";
        export const value = OTP_LENGTH;
      `,
      "src/app/[locale]/login/hooks/use-login-flow.ts"
    );

    expect(messages).toHaveLength(0);
  });

  it("rejects auth service deep imports from app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { authenticateWithOTP } from "@/modules/auth/services/otp-sign-in";
        export const leak = authenticateWithOTP;
      `,
      "src/app/[locale]/login/hooks/use-login-flow.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows single-file ledger ui imports from app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { EntryFilterPanel } from "@/modules/ledger/ui/EntryFilterPanel";
        export const value = EntryFilterPanel;
      `,
      "src/app/[locale]/(protected)/ledger/[id]/settings/page.tsx"
    );

    expect(messages).toHaveLength(0);
  });

  it("rejects deeper ledger ui imports from app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { EntryHeader } from "@/modules/ledger/ui/LedgerEntryViewDetails/components/EntryHeader";
        export const leak = EntryHeader;
      `,
      "src/app/[locale]/(protected)/ledger/[id]/settings/page.tsx"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows workspace tabs imports from app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { parseLedgerTab } from "@/modules/workspace/tabs";
        export const value = parseLedgerTab;
      `,
      "src/app/[locale]/(protected)/ledger/[id]/page.tsx"
    );

    expect(messages).toHaveLength(0);
  });
});
