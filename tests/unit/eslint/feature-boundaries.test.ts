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

  it("rejects action-style ledger imports from module root in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getLedgerAction } from "@/modules/ledger";
        export const leak = getLedgerAction;
      `,
      "src/app/api/v1/entries/route.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects action-style ledger imports from module root in workspace application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getLedgerAction } from "@/modules/ledger";
        export const leak = getLedgerAction;
      `,
      "src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows ledger actions imports from dedicated public entrypoints in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getLedgerAction } from "@/modules/ledger/actions";
        export const value = getLedgerAction;
      `,
      "src/app/api/v1/entries/route.ts"
    );

    expect(messages).toHaveLength(0);
  });

  it("allows ledger actions imports from dedicated public entrypoints in workspace application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getLedgerAction } from "@/modules/ledger/actions";
        export const value = getLedgerAction;
      `,
      "src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts"
    );

    expect(messages).toHaveLength(0);
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

  it("rejects source-document query imports from module root in cross-module callers", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getPendingSourceDocumentsAction } from "@/modules/source-document";
        export const leak = getPendingSourceDocumentsAction;
      `,
      "src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows source-document action imports from dedicated public entrypoints in modules", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getPendingSourceDocumentsAction } from "@/modules/source-document/actions";
        export const value = getPendingSourceDocumentsAction;
      `,
      "src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts"
    );

    expect(messages).toHaveLength(0);
  });

  it("rejects ledger mapper imports from module root in cross-module application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { mapLedgerEntryDto } from "@/modules/ledger";
        export const leak = mapLedgerEntryDto;
      `,
      "src/modules/source-document/application/mappers.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows ledger mapper imports from dedicated public entrypoints in cross-module application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { mapLedgerEntryDto } from "@/modules/ledger/mappers";
        export const value = mapLedgerEntryDto;
      `,
      "src/modules/source-document/application/mappers.ts"
    );

    expect(messages).toHaveLength(0);
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

  it("rejects auth helper imports from auth root in shared library files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { requireLedgerAccess } from "@/modules/auth";
        export const leak = requireLedgerAccess;
      `,
      "src/lib/auth-actions.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects auth error imports from auth root in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { AUTH_ERROR_CODES } from "@/modules/auth";
        export const leak = AUTH_ERROR_CODES;
      `,
      "src/app/[locale]/login/error/page.tsx"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows auth error imports from dedicated public entrypoints in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
        export const value = AUTH_ERROR_CODES;
      `,
      "src/app/[locale]/login/error/page.tsx"
    );

    expect(messages).toHaveLength(0);
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

  it("rejects stats action imports from module root in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getEnhancedStats } from "@/modules/stats";
        export const leak = getEnhancedStats;
      `,
      "src/app/[locale]/(protected)/ledger/[id]/page.tsx"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows stats action imports from dedicated public entrypoints in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getEnhancedStats } from "@/modules/stats/actions";
        export const value = getEnhancedStats;
      `,
      "src/app/[locale]/(protected)/ledger/[id]/page.tsx"
    );

    expect(messages).toHaveLength(0);
  });

  it("rejects task queue action imports from module root in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getTaskQueueForLedger } from "@/modules/task-queue";
        export const leak = getTaskQueueForLedger;
      `,
      "src/app/api/v1/task/items/route.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows task queue action imports from dedicated public entrypoints in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getTaskQueueForLedger } from "@/modules/task-queue/actions";
        export const value = getTaskQueueForLedger;
      `,
      "src/app/api/v1/task/items/route.ts"
    );

    expect(messages).toHaveLength(0);
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

  it("rejects workspace shell imports from legacy ledger feature tabs", async () => {
    const messages = await lintRestrictedImports(
      `
        import { LedgerEntriesTab } from "@/features/ledger/components/LedgerEntriesTab";
        export const leak = LedgerEntriesTab;
      `,
      "src/modules/workspace/ui/LedgerPageClient.tsx"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows workspace shell imports from workspace module tab entrypoints", async () => {
    const messages = await lintRestrictedImports(
      `
        import { LedgerEntriesTab } from "@/modules/workspace/ui/LedgerEntriesTab";
        export const value = LedgerEntriesTab;
      `,
      "src/modules/workspace/ui/LedgerPageClient.tsx"
    );

    expect(messages).toHaveLength(0);
  });
});
