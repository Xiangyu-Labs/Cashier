/**
 * Pure boundary rules for the Cashier source tree.
 *
 * Every rule receives the file's relative path and full source and returns
 * human-readable violations. Rules intentionally inspect static imports,
 * re-exports, and dynamic `import()` specifiers so there is no easy bypass.
 */

const importPatterns = [
  /^\s*import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/gm,
  /^\s*export\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["'];?/gm,
  /^\s*export\s+(?:type\s+)?\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s+["']([^"']+)["'];?/gm,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
];

/**
 * Whether the source starts with a `"use client"` directive after any leading
 * comments and whitespace in the module prologue.
 */
function hasClientDirective(source) {
  let rest = source;
  for (;;) {
    rest = rest.trimStart();
    if (rest.startsWith("//")) {
      const newline = rest.indexOf("\n");
      if (newline === -1) return false;
      rest = rest.slice(newline + 1);
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/");
      if (end === -1) return false;
      rest = rest.slice(end + 2);
      continue;
    }
    break;
  }
  return /^(?:"use client"|'use client');?/.test(rest);
}

const serverCompositionRootPattern = /^@\/application\/server-composition-root(?:\/|$)/;
const persistencePattern = /^@\/persistence(?:\/|$)/;
const libDbPattern = /^@\/lib\/db(?:\/|$)/;
const applicationAdaptersPattern = /^@\/application\/adapters(?:\/|$)/;
const s3Pattern = /^@\/lib\/storage\/s3(?:\/|$)/;
const openaiClientPattern = /^@\/lib\/ai\/openai-client(?:\/|$)/;
const moduleUiPattern = /^@\/modules\/[^/]+\/ui(?:\/|$)/;
const providerSdkPattern = /^(?:pg|openai|resend)$|^drizzle-orm(?:\/|$)|^@aws-sdk\//;
const transportFrameworkPattern = /^(?:next(?:\/|$)|next-auth(?:\/|$)|@auth(?:\/|$))/;
const moduleServerActionsPattern = /^@\/modules\/[^/]+\/server-actions(?:\/|$)/;
const moduleActionsBarrelPattern = /^@\/modules\/[^/]+\/actions$/;
const appPattern = /^@\/app(?:\/|$)/;
const anyModulePattern = /^@\/modules(?:\/|$)/;
const workspaceModulePattern = /^@\/modules\/workspace(?:\/|$)/;
const sourceDocumentWriterPattern = /\.(?:insert|update|delete)\(\s*sourceDocuments\s*\)/;
const registeredSourceDocumentWriters = new Set([
  "src/application/adapters/postgres/source-document-delete.ts",
  "src/application/adapters/postgres/source-document-updates.ts",
  "src/application/adapters/postgres/source-document-splits.ts",
  "src/application/adapters/postgres/revisions.ts",
  "src/application/adapters/postgres/submissions.ts",
  "src/application/adapters/postgres/ledger-projections/activate-revision.ts",
  "src/application/adapters/postgres/ledger-projections/manual-entries.ts",
  "src/application/adapters/postgres/ledger-projections/recalculate.ts",
  "src/application/adapters/postgres/source-document-aggregate/recalculate-current-entries.ts",
]);
const wholeLedgerDeleteWriter = "src/application/adapters/postgres/business-ports/ledger.ts";
const forbiddenLegacyLedgerMutationPaths = [
  /^@\/application\/adapters\/postgres\/mutate-ledger-entries(?:\/|$)/,
  /^@\/application\/adapters\/postgres\/delete-ledger-entry(?:\/|$)/,
  /^@\/modules\/ledger\/application\/use-cases\/mutate-ledger-entries(?:\/|$)/,
  /^@\/modules\/ledger\/application\/use-cases\/delete-ledger-entry(?:\/|$)/,
];
const browserSourceDocumentPath =
  /^src\/modules\/(?:source-document\/(?:hooks|ui)|ledger\/hooks|workspace)\//;
const forbiddenBrowserConcurrencyTokens = [
  "activeRevisionId",
  "pendingRevisionId",
  "expectedRevisionId",
  "operationId",
  "payloadKey",
  "contextKey",
  "newSourceDocumentId",
  "resourceGroups",
];
const forbiddenServerCompositionWriteProperties = [
  "ledgerEntryCommands",
  "ledgerEntryDates",
  "ledgerProjections",
  "sourceDocumentUpdates",
  "sourceDocumentLifecycle",
  "sourceDocumentSubmissions",
  "sourceDocumentRevisions",
];

function collectSpecifiers(source) {
  const specifiers = [];
  for (const pattern of importPatterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] != null) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

/**
 * Return boundary violations for one source file.
 *
 * @param {string} relativePath - path relative to the repository root, e.g. src/lib/x.ts
 * @param {string} source - full file contents
 * @returns {string[]}
 */
export function findBoundaryViolations(relativePath, source) {
  const violations = [];
  const specifiers = collectSpecifiers(source);
  const isModuleApplication = /^src\/modules\/[^/]+\/application\//.test(relativePath);
  const moduleMatch = /^src\/modules\/([^/]+)\//.exec(relativePath);
  const isModule = moduleMatch != null;
  const isWorkspaceModule = moduleMatch?.[1] === "workspace";
  const isAuthInternal = /^src\/modules\/auth\/(services|repositories)\//.test(relativePath);
  const isServerAction = /^src\/modules\/[^/]+\/server-actions\//.test(relativePath);
  const isLib = /^src\/lib\//.test(relativePath);
  const isProviders = /^src\/components\/providers\//.test(relativePath);
  const isContracts = /^src\/application\/contracts\//.test(relativePath);
  const isPersistence = /^src\/persistence\//.test(relativePath);
  const isApiRoute = /^src\/app\/api\//.test(relativePath);
  const isClientComponent = hasClientDirective(source);

  if (
    sourceDocumentWriterPattern.test(source) &&
    !registeredSourceDocumentWriters.has(relativePath) &&
    relativePath !== wholeLedgerDeleteWriter &&
    !relativePath.startsWith("src/persistence/postgres-migrations/")
  ) {
    violations.push(
      `${relativePath}: sourceDocuments writes must use the registered aggregate gateway`
    );
  }

  if (isServerAction) {
    for (const property of forbiddenServerCompositionWriteProperties) {
      if (new RegExp(`\\bserverComposition\\.${property}\\b`).test(source)) {
        violations.push(
          `${relativePath}: server actions must obtain source-document writes from sourceDocumentAggregate`
        );
      }
    }
  }

  if (browserSourceDocumentPath.test(relativePath)) {
    for (const token of forbiddenBrowserConcurrencyTokens) {
      if (new RegExp(`\\b${token}\\b`).test(source)) {
        violations.push(`${relativePath}: browser source-document code must not use ${token}`);
      }
    }
    if (/IdempotentLedgerEntryCommandPort|ledger-entry-idempotency/.test(source)) {
      violations.push(
        `${relativePath}: ordinary browser mutations must not use durable idempotency adapters`
      );
    }
  }

  for (const specifier of specifiers) {
    if (forbiddenLegacyLedgerMutationPaths.some((pattern) => pattern.test(specifier))) {
      violations.push(
        `${relativePath}: legacy ledger mutation path is forbidden; use the versioned source-document aggregate`
      );
    }
    if (isModule && appPattern.test(specifier)) {
      violations.push(`${relativePath}: modules must not import app entrypoints`);
    }
    if (
      isLib &&
      (anyModulePattern.test(specifier) ||
        appPattern.test(specifier) ||
        applicationAdaptersPattern.test(specifier))
    ) {
      violations.push(
        `${relativePath}: src/lib must not import modules, app, or application adapters`
      );
    }
    if (isPersistence && anyModulePattern.test(specifier)) {
      violations.push(`${relativePath}: persistence must not import domain modules`);
    }
    if (isModule && !isWorkspaceModule && workspaceModulePattern.test(specifier)) {
      violations.push(`${relativePath}: domain modules must not depend on workspace orchestration`);
    }
    if (isModuleApplication && transportFrameworkPattern.test(specifier)) {
      violations.push(`${relativePath}: application code must not import transport frameworks`);
    }
    if ((isModuleApplication || isAuthInternal) && serverCompositionRootPattern.test(specifier)) {
      violations.push(`${relativePath}: application code must receive ports explicitly`);
    }
    if (
      (isModuleApplication || isAuthInternal) &&
      (persistencePattern.test(specifier) ||
        libDbPattern.test(specifier) ||
        applicationAdaptersPattern.test(specifier))
    ) {
      violations.push(`${relativePath}: application code must not import infrastructure adapters`);
    }
    if (
      isServerAction &&
      (specifier === "drizzle-orm" ||
        libDbPattern.test(specifier) ||
        persistencePattern.test(specifier) ||
        applicationAdaptersPattern.test(specifier) ||
        /^(?:ai|openai|resend)$/.test(specifier) ||
        /^@(?:ai-sdk|aws-sdk|google|anthropic-ai)\//.test(specifier))
    ) {
      violations.push(`${relativePath}: server actions must call application ports/use cases`);
    }
    if (isLib && serverCompositionRootPattern.test(specifier)) {
      violations.push(`${relativePath}: src/lib must not import the server composition root`);
    }
    if (isProviders && moduleUiPattern.test(specifier)) {
      violations.push(`${relativePath}: src/components/providers must not import module UI`);
    }
    if (
      isContracts &&
      (persistencePattern.test(specifier) ||
        libDbPattern.test(specifier) ||
        applicationAdaptersPattern.test(specifier) ||
        providerSdkPattern.test(specifier))
    ) {
      violations.push(
        `${relativePath}: application contracts must not import persistence, database, provider SDKs, or application adapters`
      );
    }
    if (
      isClientComponent &&
      (libDbPattern.test(specifier) ||
        persistencePattern.test(specifier) ||
        serverCompositionRootPattern.test(specifier) ||
        s3Pattern.test(specifier) ||
        openaiClientPattern.test(specifier))
    ) {
      violations.push(
        `${relativePath}: client components must not import server-only infrastructure`
      );
    }
    if (
      isApiRoute &&
      (applicationAdaptersPattern.test(specifier) ||
        persistencePattern.test(specifier) ||
        libDbPattern.test(specifier))
    ) {
      violations.push(`${relativePath}: api routes must not import infrastructure adapters or db`);
    }
    if (
      isApiRoute &&
      (moduleServerActionsPattern.test(specifier) || moduleActionsBarrelPattern.test(specifier))
    ) {
      violations.push(
        `${relativePath}: api routes must not import module server actions or actions barrels`
      );
    }
  }

  return violations;
}
