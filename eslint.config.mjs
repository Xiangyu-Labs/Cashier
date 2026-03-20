import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const featureNames = [
  "auth",
  "calendar",
  "currency",
  "ledger",
  "source-document",
  "stats",
  "task-queue",
];

const moduleNames = [
  "auth",
  "currency",
  "ledger",
  "source-document",
  "stats",
  "task-queue",
  "workspace",
];

const LEGACY_FEATURE_IMPORT_PATTERNS = ["@/features/**"];

const MODULE_PUBLIC_ENTRYPOINTS = {
  auth: [
    "access",
    "actions",
    "constants",
    "contracts",
    "errors",
    "queries",
    "use-cases",
  ],
  currency: ["client", "events", "ui", "use-cases"],
  ledger: [
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
  "source-document": [
    "actions",
    "contract-schemas",
    "contracts",
    "hooks",
    "queries",
    "types",
    "ui",
    "use-cases",
  ],
  stats: ["actions", "contracts", "queries", "ui"],
  "task-queue": ["actions", "ui"],
  workspace: ["queries", "tabs", "ui", "use-cases"],
};

const SHARED_FACADE_IMPORT_RESTRICTIONS = [
  {
    name: "@/modules/auth/helpers",
    message:
      'Import auth capabilities from "@/modules/auth/access" instead of reaching into auth helpers.',
  },
  {
    name: "@/modules/currency/services",
    message:
      'Import currency capabilities from "@/modules/currency/use-cases" instead of reaching into service internals.',
  },
  {
    name: "@/modules/workspace/contracts",
    message:
      'Import workspace capabilities from "@/modules/workspace/queries", "@/modules/workspace/tabs", "@/modules/workspace/ui", or "@/modules/workspace/use-cases" instead of the removed workspace contracts entrypoint.',
  },
  {
    name: "@/modules/workspace/hooks",
    message:
      'Import workspace hooks via relative paths inside the workspace module instead of the removed workspace hooks public entrypoint.',
  },
  {
    name: "@/modules/workspace/ledger-url-navigation",
    message:
      'Import workspace URL navigation helpers via relative paths inside the workspace module instead of the removed workspace ledger-url-navigation public entrypoint.',
  },
  {
    name: "@/modules/workspace/ledger-url-params",
    message:
      'Import workspace URL param helpers via relative paths inside the workspace module instead of the removed workspace ledger-url-params public entrypoint.',
  },
];

const LEDGER_QUERY_IMPORT_RESTRICTIONS = [
  {
    name: "@/modules/ledger/queries",
    importNames: ["validateServiceCredential", "getLedgerForServiceCredential"],
    message:
      'Import credential-boundary ledger APIs from "@/modules/ledger/credential-access" instead of "@/modules/ledger/queries".',
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
  },
];

const FLOW_COMPATIBILITY_IMPORT_RESTRICTIONS = [
  {
    name: "@/lib/flow",
    importNames: ["flowEngine"],
    message:
      'Import explicit flow capabilities such as "getFlowEngine", "submitFlowTask", or "cancelFlowTask" instead of the removed flowEngine compatibility proxy.',
  },
];

function createModuleSpecificPathRestrictions(currentModule) {
  if (currentModule === "source-document") {
    return [
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
    ];
  }

  if (currentModule === "ledger") {
    return [
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
    ];
  }

  if (currentModule === "auth") {
    return [
      {
        name: "@/modules/auth/services",
        message:
          'Auth module files must import concrete internal service modules instead of the "@/modules/auth/services" barrel.',
      },
    ];
  }

  if (currentModule === "currency") {
    return [
      {
        name: "@/modules/currency/actions",
        message:
          'Currency module files must use local relative imports for actions. Cross-module callers must use "@/modules/currency/use-cases".',
      },
    ];
  }

  return [];
}

function createModuleSpecificImportPatterns(currentModule) {
  if (currentModule === "ledger") {
    return [
      {
        group: ["@/modules/source-document", "@/modules/source-document/*"],
        message:
          "Ledger module must not depend on source-document module public APIs. Move orchestration to workspace or source-document-owned hooks.",
      },
    ];
  }

  return [];
}

function createDeepFeatureImportPatterns(targetFeatures) {
  return targetFeatures.flatMap((featureName) => [
    `@/features/${featureName}/server/*/**`,
    `@/features/${featureName}/client/**`,
    `@/features/${featureName}/components/**`,
    `@/features/${featureName}/lib/**`,
  ]);
}

function createCrossFeatureBoundaryRule(currentFeature) {
  const disallowedFeatures = featureNames.filter((featureName) => featureName !== currentFeature);
  return [
    "error",
    {
      patterns: [
        {
          group: createDeepFeatureImportPatterns(disallowedFeatures),
          message: "Cross-feature imports must go through the target feature's public entrypoint.",
        },
      ],
    },
  ];
}

function createModuleRootImportRestrictions(targetModules) {
  return targetModules.map((moduleName) => ({
    name: `@/modules/${moduleName}`,
    message: `Import from an explicit public subpath (for example "@/modules/${moduleName}/actions") instead of the module root.`,
  }));
}

function describeModulePublicEntrypoints(moduleName) {
  return MODULE_PUBLIC_ENTRYPOINTS[moduleName]
    .map((entrypoint) => `@/modules/${moduleName}/${entrypoint}`)
    .join(", ");
}

function createExplicitModuleBoundaryPatterns(targetModules) {
  return targetModules.map((moduleName) => ({
    group: [
      `@/modules/${moduleName}/*`,
      ...MODULE_PUBLIC_ENTRYPOINTS[moduleName].map(
        (entrypoint) => `!@/modules/${moduleName}/${entrypoint}`
      ),
    ],
    message: `Import ${moduleName} only through declared public entrypoints: ${describeModulePublicEntrypoints(moduleName)}.`,
  }));
}

function createDeepModuleImportPatterns(targetModules) {
  return targetModules.map((moduleName) => ({
    group: [`@/modules/${moduleName}/*/**`],
    message: `Deep imports into ${moduleName} are private. Use one of: ${describeModulePublicEntrypoints(moduleName)}.`,
  }));
}

function createCrossModuleBoundaryRule(currentModule) {
  const options = createCrossModuleBoundaryOptions(currentModule);
  return ["error", options];
}

function createCrossModuleBoundaryOptions(currentModule) {
  const disallowedModules = moduleNames.filter((moduleName) => moduleName !== currentModule);
  return {
    patterns: [
      {
        group: LEGACY_FEATURE_IMPORT_PATTERNS,
        message: "Legacy feature imports are forbidden. Import from modules or lib instead.",
      },
      ...createModuleSpecificImportPatterns(currentModule),
      ...createExplicitModuleBoundaryPatterns(disallowedModules),
      ...createDeepModuleImportPatterns(disallowedModules),
    ],
    paths: [
      ...createModuleRootImportRestrictions(disallowedModules),
      ...SHARED_FACADE_IMPORT_RESTRICTIONS,
      ...LEDGER_QUERY_IMPORT_RESTRICTIONS,
      ...FLOW_COMPATIBILITY_IMPORT_RESTRICTIONS,
      ...createModuleSpecificPathRestrictions(currentModule),
    ],
  };
}

function createApplicationLayerBoundaryRule(currentModule) {
  const baseOptions = createCrossModuleBoundaryOptions(currentModule);
  const disallowedModules = moduleNames.filter((moduleName) => moduleName !== currentModule);
  return [
    "error",
    {
      ...baseOptions,
      patterns: [
        ...baseOptions.patterns,
        {
          group: [
            `@/modules/${currentModule}/actions`,
            `@/modules/${currentModule}/actions/**`,
            `@/modules/${currentModule}/server-actions/**`,
            "../actions",
            "../actions/**",
            "../../actions",
            "../../actions/**",
            "../../../actions",
            "../../../actions/**",
            "../../../../actions",
            "../../../../actions/**",
            "../server-actions/**",
            "../../server-actions/**",
            "../../../server-actions/**",
            "../../../../server-actions/**",
          ],
          message:
            "Application layer must not depend on actions or server-actions. Move shared logic into application/services or use-cases instead.",
        },
        {
          group: disallowedModules.flatMap((moduleName) => [
            `@/modules/${moduleName}/actions`,
            `@/modules/${moduleName}/actions/**`,
            `@/modules/${moduleName}/server-actions/**`,
          ]),
          message:
            "Application layer must not depend on cross-module actions or server-actions. Use the target module's query/use-case/contracts public APIs instead.",
        },
      ],
    },
  ];
}

function createLedgerContractsBoundaryOptions() {
  const baseOptions = createCrossModuleBoundaryOptions("ledger");
  const disallowedSourceDocumentEntrypoints = MODULE_PUBLIC_ENTRYPOINTS["source-document"]
    .filter((entrypoint) => entrypoint !== "contracts")
    .map((entrypoint) => ({
      name: `@/modules/source-document/${entrypoint}`,
      message:
        'Ledger contracts may import source-document only via "@/modules/source-document/contracts".',
    }));

  return {
    ...baseOptions,
    paths: [
      ...baseOptions.paths.filter(
        (restriction) => restriction.name !== "@/modules/source-document/contracts"
      ),
      ...disallowedSourceDocumentEntrypoints,
    ],
    patterns: [
      ...baseOptions.patterns.filter(
        (restriction) =>
          !restriction.message.includes(
            "Ledger module must not depend on source-document module public APIs."
          )
      ),
      {
        group: ["@/persistence", "@/persistence/**"],
        message:
          "Module public contracts/types must not depend on persistence. Define public types in the owning module instead.",
      },
    ],
  };
}

function createLedgerServerActionBoundaryRule() {
  return [
    "error",
    {
      paths: [
        {
          name: "@/lib/db",
          message:
            "Ledger server-actions must not depend on db directly. Move persistence access into ledger application queries or use-cases.",
        },
        {
          name: "@/lib/db/scoped-query",
          message:
            "Ledger server-actions must not build scoped queries directly. Move persistence access into ledger application queries or use-cases.",
        },
        {
          name: "next/cache",
          message:
            "Ledger server-actions must not invalidate cache directly. Move cache invalidation into ledger application use-cases.",
        },
        {
          name: "crypto",
          message:
            "Ledger server-actions must not generate credentials directly. Move credential generation into ledger application use-cases.",
        },
      ],
      patterns: [
        {
          group: ["@/persistence", "@/persistence/**"],
          message:
            "Ledger server-actions must not depend on persistence directly. Move data access into ledger application queries or use-cases.",
        },
      ],
    },
  ];
}

function createFeatureBoundaryConfigs(currentFeature) {
  return [
    {
      files: [
        `src/features/${currentFeature}/components/**/*.ts`,
        `src/features/${currentFeature}/components/**/*.tsx`,
        `src/features/${currentFeature}/client/**/*.ts`,
        `src/features/${currentFeature}/client/**/*.tsx`,
      ],
      rules: {
        "no-restricted-imports": createCrossFeatureBoundaryRule(currentFeature),
      },
    },
    {
      files: [`src/features/${currentFeature}/server/**/*.ts`],
      rules: {
        "no-restricted-imports": createCrossFeatureBoundaryRule(currentFeature),
      },
    },
  ];
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".worktrees/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 从 warn 改为 error - 未使用变量
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // 已是 error，保持不变
      "@typescript-eslint/no-explicit-any": "error",
      // 新增：强制使用 import type
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      // 新增：检查 useEffect 依赖 (降级为 warn 因为可能存在误报)
      "react-hooks/exhaustive-deps": "warn",
      // 新增：严格布尔表达式检查
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: true,
          allowNullableBoolean: true,
          allowNullableString: false,
          allowNullableNumber: false,
          allowAny: false,
        },
      ],
      // 禁止未处理的 Promise - 禁用 ignoreVoid 要求显式处理
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          ignoreVoid: false,
          ignoreIIFE: true,
        },
      ],
    },
  },
  {
    files: [
      "src/app/**/*.ts",
      "src/app/**/*.tsx",
      "src/components/**/*.ts",
      "src/components/**/*.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...createModuleRootImportRestrictions(moduleNames),
            ...LEDGER_QUERY_IMPORT_RESTRICTIONS,
            ...FLOW_COMPATIBILITY_IMPORT_RESTRICTIONS,
            {
              name: "@/modules/workspace/contracts",
              message:
                'Import workspace capabilities from "@/modules/workspace/queries", "@/modules/workspace/tabs", "@/modules/workspace/ui", or "@/modules/workspace/use-cases" instead of the removed workspace contracts entrypoint.',
            },
            {
              name: "@/modules/workspace/hooks",
              message:
                'Import workspace hooks via relative paths inside the workspace module instead of the removed workspace hooks public entrypoint.',
            },
            {
              name: "@/modules/workspace/ledger-url-navigation",
              message:
                'Import workspace URL navigation helpers via relative paths inside the workspace module instead of the removed workspace ledger-url-navigation public entrypoint.',
            },
            {
              name: "@/modules/workspace/ledger-url-params",
              message:
                'Import workspace URL param helpers via relative paths inside the workspace module instead of the removed workspace ledger-url-params public entrypoint.',
            },
          ],
          patterns: [
            {
              group: LEGACY_FEATURE_IMPORT_PATTERNS,
              message: "App and shared UI code must not import removed feature paths.",
            },
            {
              group: createDeepFeatureImportPatterns(featureNames),
              message:
                "App and shared UI code must import features via public root/server/client/components entrypoints.",
            },
            ...createExplicitModuleBoundaryPatterns(moduleNames),
            ...createDeepModuleImportPatterns(moduleNames),
            {
              group: ["@/persistence", "@/persistence/**"],
              message: "App and shared UI code must not depend directly on persistence.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/**/*.ts", "src/lib/**/*.tsx", "src/types/**/*.ts", "src/types/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...createModuleRootImportRestrictions(moduleNames),
            ...LEDGER_QUERY_IMPORT_RESTRICTIONS,
            ...FLOW_COMPATIBILITY_IMPORT_RESTRICTIONS,
            {
              name: "@/modules/auth/helpers",
              message:
                "Shared library/types code must not depend on auth module helpers. Use lib-level auth primitives instead.",
            },
            {
              name: "@/modules/ledger/mappers",
              message:
                "Shared library/types code must not depend on ledger module mappers. Keep domain mapping inside the owning module.",
            },
            {
              name: "@/modules/source-document/mappers",
              message:
                "Shared library/types code must not depend on source-document module mappers. Keep domain mapping inside the owning module.",
            },
          ],
          patterns: [
            {
              group: LEGACY_FEATURE_IMPORT_PATTERNS,
              message: "Shared library/types code must not import removed feature paths.",
            },
            {
              group: createDeepFeatureImportPatterns(featureNames),
              message: "Shared library/types code must not deep-import feature internals.",
            },
            ...createExplicitModuleBoundaryPatterns(moduleNames),
            ...createDeepModuleImportPatterns(moduleNames),
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/ui/**/*.ts", "src/components/ui/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/**"],
              message:
                "Shared UI primitives must not depend on domain modules. Move domain-aware UI into the owning module.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/flow/**/*.ts", "src/lib/flow/**/*.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["src/modules/*/contracts.ts", "src/modules/*/types.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/persistence", "@/persistence/**"],
              message:
                "Module public contracts/types must not depend on persistence. Define public types in the owning module instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...createModuleRootImportRestrictions(moduleNames),
            ...LEDGER_QUERY_IMPORT_RESTRICTIONS,
            ...FLOW_COMPATIBILITY_IMPORT_RESTRICTIONS,
          ],
          patterns: [
            {
              group: LEGACY_FEATURE_IMPORT_PATTERNS,
              message: "Tests must import modules or lib paths, not removed feature paths.",
            },
            ...createExplicitModuleBoundaryPatterns(moduleNames),
            ...createDeepModuleImportPatterns(moduleNames),
          ],
        },
      ],
    },
  },
  ...featureNames.flatMap((featureName) => createFeatureBoundaryConfigs(featureName)),
  ...moduleNames.map((moduleName) => ({
    files: [`src/modules/${moduleName}/**/*.ts`, `src/modules/${moduleName}/**/*.tsx`],
    rules: {
      "no-restricted-imports": createCrossModuleBoundaryRule(moduleName),
    },
  })),
  ...moduleNames.map((moduleName) => ({
    files: [
      `src/modules/${moduleName}/application/**/*.ts`,
      `src/modules/${moduleName}/application/**/*.tsx`,
    ],
    rules: {
      "no-restricted-imports": createApplicationLayerBoundaryRule(moduleName),
    },
  })),
  {
    files: ["src/modules/ledger/server-actions/**/*.ts"],
    rules: {
      "no-restricted-imports": createLedgerServerActionBoundaryRule(),
    },
  },
  ...moduleNames.map((moduleName) => ({
    files: [`src/modules/${moduleName}/contracts.ts`, `src/modules/${moduleName}/types.ts`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...createCrossModuleBoundaryOptions(moduleName),
          patterns: [
            ...createCrossModuleBoundaryOptions(moduleName).patterns,
            {
              group: ["@/persistence", "@/persistence/**"],
              message:
                "Module public contracts/types must not depend on persistence. Define public types in the owning module instead.",
            },
          ],
        },
      ],
    },
  })),
  {
    files: ["src/modules/ledger/contracts.ts"],
    rules: {
      "no-restricted-imports": ["error", createLedgerContractsBoundaryOptions()],
    },
  },
  {
    files: [
      "src/modules/workspace/ui/LedgerPageClient.tsx",
      "src/modules/workspace/ui/useLedgerPagePrefetching.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...createCrossModuleBoundaryOptions("workspace"),
          patterns: [
            ...createCrossModuleBoundaryOptions("workspace").patterns,
            {
              group: LEGACY_FEATURE_IMPORT_PATTERNS,
              message: "Workspace shell code must consume modules, not removed feature paths.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
