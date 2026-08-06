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
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
];

const serverCompositionRootPattern = /^@\/application\/server-composition-root(?:\/|$)/;
const persistencePattern = /^@\/persistence(?:\/|$)/;
const libDbPattern = /^@\/lib\/db(?:\/|$)/;
const applicationAdaptersPattern = /^@\/application\/adapters(?:\/|$)/;
const s3Pattern = /^@\/lib\/storage\/s3(?:\/|$)/;
const openaiClientPattern = /^@\/lib\/ai\/openai-client(?:\/|$)/;
const moduleUseCasesPattern = /^@\/modules\/[^/]+\/application\/use-cases(?:\/|$)/;
const moduleHooksPattern = /^@\/modules\/[^/]+\/hooks(?:\/|$)/;
const moduleUiPattern = /^@\/modules\/[^/]+\/ui(?:\/|$)/;
const moduleEventsPattern = /^@\/modules\/[^/]+\/events(?:\/|$)/;
const providerSdkPattern = /^(?:pg|openai|resend)$|^drizzle-orm(?:\/|$)|^@aws-sdk\//;

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
  const isAuthInternal = /^src\/modules\/auth\/(services|repositories)\//.test(relativePath);
  const isServerAction = /^src\/modules\/[^/]+\/server-actions\//.test(relativePath);
  const isLib = /^src\/lib\//.test(relativePath);
  const isProviders = /^src\/components\/providers\//.test(relativePath);
  const isContracts = /^src\/application\/contracts\//.test(relativePath);
  const isClientComponent = /^"use client";?/.test(source.trimStart());

  for (const specifier of specifiers) {
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
    if (
      isLib &&
      (moduleUseCasesPattern.test(specifier) ||
        moduleHooksPattern.test(specifier) ||
        moduleUiPattern.test(specifier) ||
        moduleEventsPattern.test(specifier))
    ) {
      violations.push(
        `${relativePath}: src/lib must not import module application use-cases, hooks, ui, or events`
      );
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
  }

  return violations;
}
