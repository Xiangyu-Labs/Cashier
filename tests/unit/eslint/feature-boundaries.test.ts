import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

async function lintRestrictedImports(code: string, filePath: string) {
  const eslint = new ESLint({
    overrideConfigFile: `${process.cwd()}/eslint.config.mjs`,
  });

  const [result] = await eslint.lintText(code, { filePath });
  expect(result).toBeDefined();
  if (result == null) {
    throw new Error("Expected ESLint result");
  }
  return result.messages.filter((message) => message.ruleId === "no-restricted-imports");
}

describe("boundary lint", { timeout: 30000 }, () => {
  it("rejects legacy feature imports from module files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getSourceDocumentsAction } from "@/features/source-document/server/actions/queries";
        export const leak = getSourceDocumentsAction;
      `,
      "src/modules/ledger/application/tasks/categorize-entry.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects legacy feature imports from shared library files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getSourceDocumentsAction } from "@/features/source-document/server/actions/queries";
        export const leak = getSourceDocumentsAction;
      `,
      "src/lib/error-handlers.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects legacy feature imports from test files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { determineSourceType } from "@/features/ai/types";
        export const leak = determineSourceType;
      `,
      "tests/unit/message-processor/types.test.ts"
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

  it("rejects ledger server-actions importing db directly", async () => {
    const messages = await lintRestrictedImports(
      `
        import { db } from "@/lib/db";
        export const leak = db;
      `,
      "src/modules/ledger/server-actions/settings.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects ledger server-actions importing persistence directly", async () => {
    const messages = await lintRestrictedImports(
      `
        import { ledgers } from "@/persistence";
        export const leak = ledgers;
      `,
      "src/modules/ledger/server-actions/export.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects ledger server-actions importing next cache directly", async () => {
    const messages = await lintRestrictedImports(
      `
        import { updateTag } from "next/cache";
        export const leak = updateTag;
      `,
      "src/modules/ledger/server-actions/update.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects ledger server-actions importing crypto directly", async () => {
    const messages = await lintRestrictedImports(
      `
        import crypto from "crypto";
        export const leak = crypto;
      `,
      "src/modules/ledger/server-actions/credentials.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects ledger actions imports from dedicated public entrypoints in workspace application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getLedgerAction } from "@/modules/ledger/actions";
        export const value = getLedgerAction;
      `,
      "src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts"
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

  it("allows workspace query imports from dedicated public entrypoints in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getLedgerPageBootstrap } from "@/modules/workspace/queries";
        export const value = getLedgerPageBootstrap;
      `,
      "src/app/[locale]/(protected)/ledger/[id]/page.tsx"
    );

    expect(messages).toHaveLength(0);
  });

  it("allows workspace use-case imports from dedicated public entrypoints in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { resolveHome } from "@/modules/workspace/use-cases";
        export const value = resolveHome;
      `,
      "src/app/[locale]/(protected)/page.tsx"
    );

    expect(messages).toHaveLength(0);
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

  it("rejects source-document action imports from dedicated public entrypoints in workspace application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getPendingSourceDocumentsAction } from "@/modules/source-document/actions";
        export const value = getPendingSourceDocumentsAction;
      `,
      "src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows source-document query imports from dedicated public entrypoints in workspace application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getPendingSourceDocuments } from "@/modules/source-document/queries";
        export const value = getPendingSourceDocuments;
      `,
      "src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts"
    );

    expect(messages).toHaveLength(0);
  });

  it("allows source-document ui imports from the public ui entrypoint in cross-module ui files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { SourceDocumentCard } from "@/modules/source-document/ui";
        export const value = SourceDocumentCard;
      `,
      "src/modules/workspace/ui/LedgerEntriesTab.tsx"
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

  it("rejects ledger mapper imports from dedicated public entrypoints in cross-module application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { mapLedgerEntryDto } from "@/modules/ledger/mappers";
        export const value = mapLedgerEntryDto;
      `,
      "src/modules/source-document/application/mappers.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects source-document ledger query imports from the generic ledger query entrypoint", async () => {
    const messages = await lintRestrictedImports(
      `
        import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/queries";
        export const value = listLedgerEntryViewsBySourceDocumentIds;
      `,
      "src/modules/source-document/server-actions/queries.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows source-document ledger query imports from the dedicated entrypoint", async () => {
    const messages = await lintRestrictedImports(
      `
        import { listLedgerEntryViewsBySourceDocumentIds } from "@/modules/ledger/source-document-queries";
        export const value = listLedgerEntryViewsBySourceDocumentIds;
      `,
      "src/modules/source-document/server-actions/queries.ts"
    );

    expect(messages).toHaveLength(0);
  });

  it("rejects credential-boundary ledger imports from the generic ledger query entrypoint", async () => {
    const messages = await lintRestrictedImports(
      `
        import { validateServiceCredential } from "@/modules/ledger/queries";
        export const value = validateServiceCredential;
      `,
      "src/app/api/v1/_shared/route-helper.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows credential-boundary ledger imports from the dedicated entrypoint", async () => {
    const messages = await lintRestrictedImports(
      `
        import { authenticateServiceCredential } from "@/modules/ledger/credential-access";
        export const value = authenticateServiceCredential;
      `,
      "src/app/api/v1/_shared/route-helper.ts"
    );

    expect(messages).toHaveLength(0);
  });

  it("rejects ledger use-case imports from source-document module files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { replaceLedgerEntriesForSourceDocument } from "@/modules/ledger/use-cases";
        export const leak = replaceLedgerEntriesForSourceDocument;
      `,
      "src/modules/source-document/application/tasks/parse-result-handler.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects source-document action imports from ledger module files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { deleteSourceDocumentAction } from "@/modules/source-document/actions";
        export const leak = deleteSourceDocumentAction;
      `,
      "src/modules/ledger/hooks/useLedgerEntriesMutations.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows source-document contracts imports in ledger contracts for canonical reference types", async () => {
    const messages = await lintRestrictedImports(
      `
        import type { SourceDocumentStatusType } from "@/modules/source-document/contracts";
        export type Value = SourceDocumentStatusType;
      `,
      "src/modules/ledger/contracts.ts"
    );

    expect(messages).toHaveLength(0);
  });

  it("rejects source-document contracts imports from non-contract ledger module files", async () => {
    const messages = await lintRestrictedImports(
      `
        import type { SourceDocumentStatusType } from "@/modules/source-document/contracts";
        export type Value = SourceDocumentStatusType;
      `,
      "src/modules/ledger/hooks/useLedgerEntriesMutations.ts"
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

  it("rejects same-module action imports from application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { createSourceDocumentAction } from "@/modules/source-document/actions";
        export const leak = createSourceDocumentAction;
      `,
      "src/modules/source-document/application/use-cases/create-from-credential.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects same-module server-action imports from application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { createSourceDocumentAction } from "@/modules/source-document/server-actions/create";
        export const leak = createSourceDocumentAction;
      `,
      "src/modules/source-document/application/use-cases/create-from-credential.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects persistence imports from module contracts", async () => {
    const messages = await lintRestrictedImports(
      `
        import type { ledgers } from "@/persistence";
        export type Leak = typeof ledgers;
      `,
      "src/modules/ledger/contracts.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects persistence imports from module types", async () => {
    const messages = await lintRestrictedImports(
      `
        import type { SourceDocumentStatusType } from "@/persistence/schema/source-document";
        export type Leak = SourceDocumentStatusType;
      `,
      "src/modules/source-document/types.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects source-document persistence enum imports inside the source-document module", async () => {
    const messages = await lintRestrictedImports(
      `
        import { SourceDocumentType } from "@/persistence/schema/source-document";
        export const leak = SourceDocumentType.Manual;
      `,
      "src/modules/source-document/application/use-cases/create-quick-entry.ts"
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

  it("rejects currency action imports from cross-module application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { batchConvertCurrencyAction } from "@/modules/currency/actions";
        export const value = batchConvertCurrencyAction;
      `,
      "src/modules/ledger/application/use-cases/mutate-ledger-entries.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
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

  it("allows auth use-case imports from dedicated public entrypoints in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { authenticateWithOTP } from "@/modules/auth/use-cases";
        export const value = authenticateWithOTP;
      `,
      "src/auth.ts"
    );

    expect(messages).toHaveLength(0);
  });

  it("rejects auth service barrel imports from auth application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { generateOTP } from "@/modules/auth/services";
        export const value = generateOTP;
      `,
      "src/modules/auth/application/use-cases/send-otp.ts"
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

  it("rejects stats action imports from dedicated public entrypoints in workspace application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getEnhancedStats } from "@/modules/stats/actions";
        export const value = getEnhancedStats;
      `,
      "src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows stats query imports from dedicated public entrypoints in workspace application files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getEnhancedStats } from "@/modules/stats/queries";
        export const value = getEnhancedStats;
      `,
      "src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts"
    );

    expect(messages).toHaveLength(0);
  });

  it("rejects task queue action imports from module root in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getTaskQueueForAuthorizedLedger } from "@/modules/task-queue";
        export const leak = getTaskQueueForAuthorizedLedger;
      `,
      "src/app/api/v1/task/items/route.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows task queue action imports from dedicated public entrypoints in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getTaskQueueForAuthorizedLedger } from "@/modules/task-queue/actions";
        export const value = getTaskQueueForAuthorizedLedger;
      `,
      "src/app/api/v1/task/items/route.ts"
    );

    expect(messages).toHaveLength(0);
  });

  it("rejects module imports from shared ui primitives", async () => {
    const messages = await lintRestrictedImports(
      `
        import { useAmountDisplay } from "@/modules/currency/client";
        export const leak = useAmountDisplay;
      `,
      "src/components/ui/button.tsx"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects auth helper imports from shared library files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { requireLedgerAccess } from "@/modules/auth/helpers";
        export const leak = requireLedgerAccess;
      `,
      "src/lib/auth-actions.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects auth helper imports from test files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { requireLedgerAccess } from "@/modules/auth/helpers";
        export const leak = requireLedgerAccess;
      `,
      "tests/integration/auth/auth-helpers.test.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects currency services imports from test files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { ExchangeRateService } from "@/modules/currency/services";
        export const leak = ExchangeRateService;
      `,
      "tests/integration/ledger/entry-actions.test.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects module mapper imports from shared library files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { mapLedgerEntryDto } from "@/modules/ledger/mappers";
        export const leak = mapLedgerEntryDto;
      `,
      "src/lib/serialization/utils.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects single-file ledger ui imports from app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { EntryFilterPanel } from "@/modules/ledger/ui/EntryFilterPanel";
        export const leak = EntryFilterPanel;
      `,
      "src/app/[locale]/(protected)/ledger/[id]/settings/page.tsx"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows ledger ui imports from the public ui entrypoint in app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { EntryFilterPanel } from "@/modules/ledger/ui";
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

  it("rejects single-file ledger hook imports from cross-module ui files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { useGroupedEntries } from "@/modules/ledger/hooks/useGroupedEntries";
        export const leak = useGroupedEntries;
      `,
      "src/modules/workspace/ui/LedgerEntriesTab.tsx"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows ledger hook imports from the public hooks entrypoint in cross-module ui files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { useGroupedEntries } from "@/modules/ledger/hooks";
        export const value = useGroupedEntries;
      `,
      "src/modules/workspace/ui/LedgerEntriesTab.tsx"
    );

    expect(messages).toHaveLength(0);
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

  it("rejects workspace hook imports from test files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { useLedgerTabs } from "@/modules/workspace/hooks";
        export const value = useLedgerTabs;
      `,
      "src/modules/ledger/ui/SettingsTab.tsx"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects workspace ledger-url-params imports from test files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { updateLedgerSearchParams } from "@/modules/workspace/ledger-url-params";
        export const value = updateLedgerSearchParams;
      `,
      "src/modules/ledger/ui/SettingsTab.tsx"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects workspace contracts imports from cross-module app files", async () => {
    const messages = await lintRestrictedImports(
      `
        import type { ResolveHomeResult } from "@/modules/workspace/contracts";
        export type Value = ResolveHomeResult;
      `,
      "src/app/[locale]/(protected)/page.tsx"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects workspace initial query state imports from cross-module hook files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getDetailsInitialQueryState } from "@/modules/workspace/initial-query-state";
        export const leak = getDetailsInitialQueryState;
      `,
      "src/modules/ledger/hooks/useDetailsTabData.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects workspace shell imports from removed feature tabs", async () => {
    const messages = await lintRestrictedImports(
      `
        import { LedgerEntriesTab } from "@/features/ledger/components/LedgerEntriesTab";
        export const leak = LedgerEntriesTab;
      `,
      "src/modules/workspace/ui/LedgerPageClient.tsx"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows workspace shell imports from the workspace ui barrel", async () => {
    const messages = await lintRestrictedImports(
      `
        import { LedgerPageClient } from "@/modules/workspace/ui";
        export const value = LedgerPageClient;
      `,
      "src/modules/workspace/ui/LedgerPageClient.tsx"
    );

    expect(messages).toHaveLength(0);
  });

  it("rejects deep stats ui imports from test files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { LargeGridHeatmap } from "@/modules/stats/ui/AdaptiveHeatmap/LargeGrid";
        export const leak = LargeGridHeatmap;
      `,
      "tests/unit/components/providers.test.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("rejects flowEngine compatibility imports from module files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { flowEngine } from "@/lib/flow";
        export const leak = flowEngine;
      `,
      "src/modules/ledger/application/services/categorize-task-submission.ts"
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows explicit flow engine access from module files", async () => {
    const messages = await lintRestrictedImports(
      `
        import { getFlowEngine } from "@/lib/flow";
        export const value = getFlowEngine;
      `,
      "src/modules/ledger/application/services/categorize-task-submission.ts"
    );

    expect(messages).toHaveLength(0);
  });
});
