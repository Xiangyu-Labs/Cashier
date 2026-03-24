import fs from "node:fs";
import path from "node:path";

const RULE_NAME = "cashier/architecture-boundaries";

const MODULE_BOUNDARIES = {
  admin: {
    public: ["access", "queries", "types", "ui"],
  },
  auth: {
    public: [
      "access",
      "actions",
      "constants",
      "contract-schemas",
      "contracts",
      "errors",
      "queries",
      "ui",
      "use-cases",
    ],
    privatePaths: [
      {
        name: "@/modules/auth/services",
        message:
          'Auth module files must import concrete internal service modules instead of the "@/modules/auth/services" barrel.',
      },
    ],
  },
  currency: {
    public: ["actions", "client", "contracts", "events", "ui", "use-cases"],
    privatePaths: [
      {
        name: "@/modules/currency/actions",
        message:
          'Currency module files must use local relative imports for actions. Cross-module callers must use "@/modules/currency/use-cases".',
      },
    ],
  },
  ledger: {
    public: [
      "access",
      "actions",
      "contract-schemas",
      "contracts",
      "credential-access",
      "hooks",
      "queries",
      "source-document-queries",
      "ui",
      "use-cases",
    ],
    blockedModules: {
      "source-document":
        "Ledger module must not depend on source-document module public APIs. Move orchestration to workspace or source-document-owned hooks.",
    },
    privatePaths: [
      {
        name: "@/modules/source-document/contracts",
        message:
          "Ledger module must not depend on source-document contracts. Use local reference DTOs or source-document public APIs instead.",
      },
      {
        name: "@/modules/source-document/types",
        message:
          "Ledger module must not depend on source-document internal types. Keep reference literals local to ledger.",
      },
    ],
  },
  "source-document": {
    public: [
      "actions",
      "contract-schemas",
      "contracts",
      "hooks",
      "queries",
      "types",
      "ui",
      "use-cases",
    ],
    privatePaths: [
      {
        name: "@/modules/ledger/mappers",
        message:
          'Source-document module must not depend on ledger mappers. Use "@/modules/ledger/source-document-queries" or embedded view types instead.',
      },
      {
        name: "@/modules/ledger/use-cases",
        message:
          "Source-document module must not depend on ledger write use-cases. Keep only narrow ledger queries as the cross-module boundary.",
      },
      {
        name: "@/persistence/schema/source-document",
        message:
          'Source-document module must use "@/modules/source-document/types" as the single source of truth for source-document enums and metadata types.',
      },
    ],
  },
  stats: {
    public: ["actions", "contract-schemas", "contracts", "queries", "types", "ui"],
  },
  "task-queue": {
    public: ["actions", "contract-schemas", "contracts", "types", "ui"],
  },
  workspace: {
    public: ["queries", "tabs", "ui", "use-cases"],
  },
};

const NAMED_IMPORT_RESTRICTIONS = [
  {
    name: "@/modules/auth/access",
    importNames: ["requireLedgerAccess"],
    message:
      'Import ledger authorization from "@/modules/ledger/access" instead of "@/modules/auth/access".',
    appliesTo: ["app-shared", "lib-types", "module", "module-application", "module-public"],
  },
  {
    name: "@/modules/ledger/queries",
    importNames: ["validateServiceCredential", "getLedgerForServiceCredential"],
    message:
      'Import credential-boundary ledger APIs from "@/modules/ledger/credential-access" instead of "@/modules/ledger/queries".',
    appliesTo: ["app-shared", "lib-types", "module", "module-application", "module-public"],
  },
  {
    name: "@/modules/ledger/queries",
    importNames: [
      "getEntryCategoryName",
      "getLedgerMainCurrency",
      "listEntryCategoryInfos",
      "listLedgerEntryViewsBySourceDocumentIds",
    ],
    message:
      'Import source-document-facing ledger reads from "@/modules/ledger/source-document-queries" instead of "@/modules/ledger/queries".',
    appliesTo: ["app-shared", "lib-types", "module", "module-application", "module-public"],
  },
  {
    name: "@/lib/flow",
    importNames: ["flowEngine"],
    message:
      'Import explicit flow capabilities such as "getFlowEngine", "submitFlowTask", or "cancelFlowTask" instead of the removed flowEngine compatibility proxy.',
    appliesTo: ["app-shared", "lib-types", "module", "module-application", "module-public"],
  },
];

const DEPRECATED_PATH_RESTRICTIONS = [
  {
    name: "@/modules/auth/helpers",
    message:
      'Import auth capabilities from "@/modules/auth/access" instead of reaching into auth helpers.',
    appliesTo: ["app-shared", "lib-types", "module", "module-application", "module-public"],
  },
  {
    name: "@/modules/currency/services",
    message:
      'Import currency capabilities from "@/modules/currency/use-cases" instead of reaching into service internals.',
    appliesTo: ["app-shared", "module", "module-application", "module-public"],
  },
  {
    name: "@/modules/workspace/contracts",
    message:
      'Import workspace capabilities from "@/modules/workspace/queries", "@/modules/workspace/tabs", "@/modules/workspace/ui", or "@/modules/workspace/use-cases" instead of the removed workspace contracts entrypoint.',
    appliesTo: ["app-shared", "module", "module-application", "module-public"],
  },
  {
    name: "@/modules/workspace/hooks",
    message:
      "Import workspace hooks via relative paths inside the workspace module instead of the removed workspace hooks public entrypoint.",
    appliesTo: ["app-shared", "module", "module-application", "module-public"],
  },
  {
    name: "@/modules/workspace/ledger-url-navigation",
    message:
      "Import workspace URL navigation helpers via relative paths inside the workspace module instead of the removed workspace ledger-url-navigation public entrypoint.",
    appliesTo: ["app-shared", "module", "module-application", "module-public"],
  },
  {
    name: "@/modules/workspace/ledger-url-params",
    message:
      "Import workspace URL param helpers via relative paths inside the workspace module instead of the removed workspace ledger-url-params public entrypoint.",
    appliesTo: ["app-shared", "module", "module-application", "module-public"],
  },
  {
    name: "@/modules/ledger/mappers",
    message:
      "Shared library/types code must not depend on ledger module mappers. Keep domain mapping inside the owning module.",
    appliesTo: ["lib-types"],
  },
  {
    name: "@/modules/source-document/mappers",
    message:
      "Shared library/types code must not depend on source-document module mappers. Keep domain mapping inside the owning module.",
    appliesTo: ["lib-types"],
  },
];

function moduleEntrypointExists(rootDir, moduleName, entrypoint) {
  const moduleRoot = path.join(rootDir, "src/modules", moduleName);
  return [
    path.join(moduleRoot, `${entrypoint}.ts`),
    path.join(moduleRoot, `${entrypoint}.tsx`),
    path.join(moduleRoot, entrypoint, "index.ts"),
    path.join(moduleRoot, entrypoint, "index.tsx"),
  ].some((candidate) => fs.existsSync(candidate));
}

function validateBoundaryModel(rootDir) {
  for (const [moduleName, config] of Object.entries(MODULE_BOUNDARIES)) {
    for (const entrypoint of config.public) {
      if (!moduleEntrypointExists(rootDir, moduleName, entrypoint)) {
        throw new Error(
          `architecture boundary model references missing entrypoint "${moduleName}/${entrypoint}"`
        );
      }
    }
  }
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function getProjectFilePath(filename, rootDir) {
  if (filename === "<input>") return filename;
  const relative = normalizePath(path.relative(rootDir, filename));
  return relative.startsWith("../") ? normalizePath(filename) : relative;
}

function detectFileContext(filePath) {
  if (filePath === "<input>") return { kind: "generic" };
  if (filePath.startsWith("src/lib/flow/")) return { kind: "ignore" };
  if (filePath.startsWith("tests/")) return { kind: "tests" };
  if (filePath.startsWith("src/components/ui/")) return { kind: "shared-ui-primitive" };
  if (filePath.startsWith("src/app/") || filePath.startsWith("src/components/")) {
    return { kind: "app-shared" };
  }
  if (filePath.startsWith("src/lib/") || filePath.startsWith("src/types/")) {
    return { kind: "lib-types" };
  }

  const moduleMatch = filePath.match(/^src\/modules\/([^/]+)\/(.*)$/);
  if (!moduleMatch) return { kind: "generic" };

  const [, moduleName, rest] = moduleMatch;

  if (moduleName === "ledger" && rest.startsWith("server-actions/")) {
    return { kind: "ledger-server-actions", moduleName };
  }
  if (moduleName === "ledger" && rest === "contracts.ts") {
    return { kind: "ledger-contracts", moduleName };
  }
  if (rest === "contracts.ts" || rest === "types.ts") {
    return { kind: "module-public", moduleName };
  }
  if (rest.startsWith("application/")) {
    return { kind: "module-application", moduleName };
  }
  return { kind: "module", moduleName };
}

function parseModuleSpecifier(specifier) {
  const match = specifier.match(/^@\/modules\/([^/]+)(?:\/([^/]+))?(?:\/(.*))?$/);
  if (!match) return null;
  const [, moduleName, entrypoint, remainder] = match;
  return {
    moduleName,
    entrypoint: entrypoint ?? null,
    isRoot: entrypoint == null,
    isDeep: remainder != null,
  };
}

function resolveRelativeImport(filePath, specifier) {
  return normalizePath(path.normalize(path.join(path.dirname(filePath), specifier)));
}

function isPersistenceImport(specifier) {
  return specifier === "@/persistence" || specifier.startsWith("@/persistence/");
}

function getImportedNames(node) {
  if ("specifiers" in node && Array.isArray(node.specifiers)) {
    return node.specifiers
      .map((specifier) => {
        if (specifier.type === "ImportSpecifier") return specifier.imported.name;
        if (specifier.type === "ImportDefaultSpecifier") return "default";
        if (specifier.type === "ImportNamespaceSpecifier") return "*";
        if (specifier.type === "ExportSpecifier") return specifier.local.name;
        return null;
      })
      .filter(Boolean);
  }
  return [];
}

function createReport(node, message) {
  return { node, message };
}

function checkNamedImportRestrictions(node, specifier, contextKind) {
  const importedNames = getImportedNames(node);
  for (const restriction of NAMED_IMPORT_RESTRICTIONS) {
    if (restriction.name !== specifier) continue;
    if (!restriction.appliesTo.includes(contextKind)) continue;
    if (!restriction.importNames.some((name) => importedNames.includes(name))) continue;
    return createReport(node, restriction.message);
  }
  return null;
}

function checkDeprecatedPathRestrictions(node, specifier, contextKind, currentModule) {
  if (currentModule != null) {
    for (const restriction of MODULE_BOUNDARIES[currentModule].privatePaths ?? []) {
      if (
        contextKind === "ledger-contracts" &&
        currentModule === "ledger" &&
        specifier === "@/modules/source-document/contracts"
      ) {
        continue;
      }
      if (restriction.name === specifier) {
        return createReport(node, restriction.message);
      }
    }
  }

  for (const restriction of DEPRECATED_PATH_RESTRICTIONS) {
    if (restriction.name !== specifier) continue;
    if (!restriction.appliesTo.includes(contextKind)) continue;
    if (
      currentModule === "workspace" &&
      (specifier === "@/modules/workspace/hooks" ||
        specifier === "@/modules/workspace/ledger-url-navigation" ||
        specifier === "@/modules/workspace/ledger-url-params")
    ) {
      return createReport(node, restriction.message);
    }
    if (
      specifier !== "@/modules/workspace/hooks" &&
      specifier !== "@/modules/workspace/ledger-url-navigation" &&
      specifier !== "@/modules/workspace/ledger-url-params"
    ) {
      return createReport(node, restriction.message);
    }
  }
  return null;
}

function checkRelativeImport(node, specifier, filePath, fileContext) {
  if (!specifier.startsWith(".")) return null;

  const resolved = resolveRelativeImport(filePath, specifier);

  if (fileContext.kind === "tests" && resolved.startsWith("src/")) {
    return createReport(
      node,
      'Tests must import source files through "@/..." aliases instead of relative "src" paths.'
    );
  }

  if (
    ["app-shared", "lib-types", "shared-ui-primitive"].includes(fileContext.kind) &&
    (resolved.startsWith("src/modules/") ||
      resolved.startsWith("src/features/") ||
      resolved.startsWith("src/persistence/"))
  ) {
    const scope =
      fileContext.kind === "shared-ui-primitive"
        ? "Shared UI primitives"
        : fileContext.kind === "lib-types"
          ? "Shared library/types code"
          : "App and shared UI code";
    return createReport(
      node,
      `${scope} must use "@/..." aliases instead of relative project paths.`
    );
  }

  if (!fileContext.moduleName) return null;
  if (!resolved.startsWith("src/modules/")) return null;

  const targetModule = resolved.split("/")[2];
  if (targetModule !== fileContext.moduleName) {
    return createReport(
      node,
      `Cross-module relative imports are private. Use one of: ${MODULE_BOUNDARIES[
        targetModule
      ].public
        .map((entrypoint) => `@/modules/${targetModule}/${entrypoint}`)
        .join(", ")}.`
    );
  }

  if (
    fileContext.kind === "module-application" &&
    resolved.startsWith(`src/modules/${fileContext.moduleName}/`) &&
    (resolved.includes("/actions") || resolved.includes("/server-actions"))
  ) {
    return createReport(
      node,
      "Application layer must not depend on actions or server-actions. Move shared logic into application/services or use-cases instead."
    );
  }

  return null;
}

function checkPersistenceRestrictions(node, specifier, fileContext) {
  if (!isPersistenceImport(specifier)) return null;

  if (fileContext.kind === "app-shared") {
    return createReport(node, "App and shared UI code must not depend directly on persistence.");
  }
  if (fileContext.kind === "module-public" || fileContext.kind === "ledger-contracts") {
    return createReport(
      node,
      "Module public contracts/types must not depend on persistence. Define public types in the owning module instead."
    );
  }
  if (fileContext.kind === "ledger-server-actions") {
    return createReport(
      node,
      "Ledger server-actions must not depend on persistence directly. Move data access into ledger application queries or use-cases."
    );
  }
  return null;
}

function checkDirectPathRestrictions(node, specifier, fileContext) {
  if (fileContext.kind === "ledger-server-actions") {
    if (specifier === "@/lib/db") {
      return createReport(
        node,
        "Ledger server-actions must not depend on db directly. Move persistence access into ledger application queries or use-cases."
      );
    }
    if (specifier === "@/lib/db/scoped-query") {
      return createReport(
        node,
        "Ledger server-actions must not build scoped queries directly. Move persistence access into ledger application queries or use-cases."
      );
    }
    if (specifier === "next/cache") {
      return createReport(
        node,
        "Ledger server-actions must not invalidate cache directly. Move cache invalidation into ledger application use-cases."
      );
    }
    if (specifier === "crypto") {
      return createReport(
        node,
        "Ledger server-actions must not generate credentials directly. Move credential generation into ledger application use-cases."
      );
    }
  }

  if (fileContext.kind === "shared-ui-primitive" && specifier.startsWith("@/modules/")) {
    return createReport(
      node,
      "Shared UI primitives must not depend on domain modules. Move domain-aware UI into the owning module."
    );
  }

  return null;
}

function checkModuleImport(node, specifier, fileContext) {
  const parsed = parseModuleSpecifier(specifier);
  if (!parsed) return null;
  const isSameModule =
    fileContext.moduleName != null && parsed.moduleName === fileContext.moduleName;

  if (fileContext.kind === "tests") {
    if (parsed.isRoot) {
      return createReport(
        node,
        `Import from an explicit public subpath (for example "@/modules/${parsed.moduleName}/actions") instead of the module root.`
      );
    }
    return null;
  }

  if (fileContext.kind === "shared-ui-primitive") {
    return createReport(
      node,
      "Shared UI primitives must not depend on domain modules. Move domain-aware UI into the owning module."
    );
  }

  if (fileContext.kind === "generic") return null;

  if (parsed.isRoot) {
    if (!isSameModule) {
      return createReport(
        node,
        `Import from an explicit public subpath (for example "@/modules/${parsed.moduleName}/actions") instead of the module root.`
      );
    }
    return null;
  }

  if (fileContext.kind === "ledger-contracts" && parsed.moduleName === "source-document") {
    if (parsed.entrypoint !== "contracts" || parsed.isDeep) {
      return createReport(
        node,
        'Ledger contracts may import source-document only via "@/modules/source-document/contracts".'
      );
    }
    return null;
  }

  if (!isSameModule) {
    const currentConfig = fileContext.moduleName ? MODULE_BOUNDARIES[fileContext.moduleName] : null;
    const blockedMessage = currentConfig?.blockedModules?.[parsed.moduleName];
    if (blockedMessage) {
      return createReport(node, blockedMessage);
    }

    if (parsed.isDeep) {
      return createReport(
        node,
        `Deep imports into ${parsed.moduleName} are private. Use one of: ${MODULE_BOUNDARIES[
          parsed.moduleName
        ].public
          .map((entrypoint) => `@/modules/${parsed.moduleName}/${entrypoint}`)
          .join(", ")}.`
      );
    }

    if (!MODULE_BOUNDARIES[parsed.moduleName].public.includes(parsed.entrypoint)) {
      return createReport(
        node,
        `Import ${parsed.moduleName} only through declared public entrypoints: ${MODULE_BOUNDARIES[
          parsed.moduleName
        ].public
          .map((entrypoint) => `@/modules/${parsed.moduleName}/${entrypoint}`)
          .join(", ")}.`
      );
    }
  }

  if (
    fileContext.kind === "module-application" &&
    ((parsed.moduleName === fileContext.moduleName &&
      (parsed.entrypoint === "actions" || parsed.entrypoint === "server-actions")) ||
      (parsed.moduleName !== fileContext.moduleName &&
        (parsed.entrypoint === "actions" || parsed.entrypoint === "server-actions")))
  ) {
    return createReport(
      node,
      parsed.moduleName === fileContext.moduleName
        ? "Application layer must not depend on actions or server-actions. Move shared logic into application/services or use-cases instead."
        : "Application layer must not depend on cross-module actions or server-actions. Use the target module's query/use-case/contracts public APIs instead."
    );
  }

  return null;
}

function checkLegacyFeatureImport(node, specifier) {
  if (!specifier.startsWith("@/features/")) return null;
  return createReport(
    node,
    "Legacy feature imports are forbidden. Import from modules or lib instead."
  );
}

const architectureBoundariesRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce Cashier architecture import boundaries.",
    },
    schema: [
      {
        type: "object",
        properties: {
          rootDir: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const rootDir = context.options[0]?.rootDir ?? context.cwd;
    const filePath = getProjectFilePath(context.filename, rootDir);
    const fileContext = detectFileContext(filePath);

    if (fileContext.kind === "ignore") return {};

    function inspectImportNode(node) {
      const specifier = node.source?.value;
      if (typeof specifier !== "string") return;

      const checks = [
        checkLegacyFeatureImport(node, specifier),
        checkRelativeImport(node, specifier, filePath, fileContext),
        checkPersistenceRestrictions(node, specifier, fileContext),
        checkDirectPathRestrictions(node, specifier, fileContext),
        checkDeprecatedPathRestrictions(node, specifier, fileContext.kind, fileContext.moduleName),
        checkNamedImportRestrictions(node, specifier, fileContext.kind),
        checkModuleImport(node, specifier, fileContext),
      ];

      for (const report of checks) {
        if (report == null) continue;
        context.report(report);
        return;
      }
    }

    return {
      ImportDeclaration: inspectImportNode,
      ExportNamedDeclaration(node) {
        if (node.source == null) return;
        inspectImportNode(node);
      },
      ExportAllDeclaration: inspectImportNode,
    };
  },
};

export function createBoundaryConfigs({ rootDir }) {
  validateBoundaryModel(rootDir);

  return [
    {
      files: ["**/*.ts", "**/*.tsx"],
      plugins: {
        cashier: {
          rules: {
            "architecture-boundaries": architectureBoundariesRule,
          },
        },
      },
      rules: {
        [RULE_NAME]: ["error", { rootDir }],
      },
    },
  ];
}
