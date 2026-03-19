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

const moduleRootRestrictedImports = {
  auth: [
    {
      importNames: [
        "sendOTPAction",
        "deleteAccount",
        "AUTH_ERROR_CODES",
        "AuthErrorCode",
        "getCurrentUser",
        "requireLedgerAccess",
        "authenticateWithOTP",
        "OTPInvalidSignInError",
        "OTPExpiredSignInError",
        "OTPLockedSignInError",
        "OTPRateLimitedSignInError",
        "isRegistrationAllowed",
        "assertRegistrationAllowed",
        "RegistrationDisabledError",
        "generateOTP",
        "verifyOTP",
        "hashOTP",
        "isValidOTPFormat",
        "getOTPExpiration",
        "getLockoutExpiration",
        "getMaxAttempts",
        "getResendCooldown",
        "OTP_LENGTH",
        "checkSendRateLimit",
        "checkSendRateLimitByIP",
        "checkResendCooldown",
        "setResendCooldown",
        "getCanResendAt",
        "checkVerifyRateLimit",
        "findOTPRecord",
        "verifyOTPWithPolicy",
        "isAccountLocked",
        "createDefaultLedgerForUser",
        "clearUserDefaultLedger",
      ],
      message:
        'Import these APIs from "@/modules/auth/actions", "@/modules/auth/errors", "@/modules/auth/helpers", or "@/modules/auth/services" instead of the module root.',
    },
  ],
  ledger: [
    {
      importNames: [
        "getLedgerAction",
        "getLedgersAction",
        "createLedgerAction",
        "updateLedgerAction",
        "deleteLedgerAction",
        "listEntryCategories",
        "getEntryCategoriesAction",
        "createEntryCategoryAction",
        "updateEntryCategoryAction",
        "deleteEntryCategoryAction",
        "reorderEntryCategoriesAction",
        "getUncategorizedCountAction",
        "listLedgerEntries",
        "updateLedgerEntryAction",
        "deleteLedgerEntryAction",
        "batchUpdateLedgerEntriesAction",
        "batchDeleteLedgerEntriesAction",
        "createLedgerEntryAction",
        "getLedgerEntriesAction",
        "getLedgerEntryAction",
        "submitAutoCategorizeAction",
        "submitBatchCategorizeAction",
        "exportLedgerEntriesAction",
        "getLedgerSettingsAction",
        "getServiceCredentialsAction",
        "createServiceCredentialAction",
        "deleteServiceCredentialAction",
        "validateServiceCredential",
        "getLedgerStatsAction",
        "calculateLedgerStats",
      ],
      message: 'Import these APIs from "@/modules/ledger/actions" instead of the module root.',
    },
    {
      importNames: [
        "mapLedgerDto",
        "mapEntryCategoryDto",
        "mapLedgerEntryDto",
        "mapServiceCredentialDto",
      ],
      message: 'Import these mappers from "@/modules/ledger/mappers" instead of the module root.',
    },
  ],
  "source-document": [
    {
      importNames: [
        "listSourceDocuments",
        "getSourceDocumentFullAction",
        "getSourceDocumentsAction",
        "getAllSourceDocumentsAction",
        "getPendingSourceDocumentsAction",
        "getSourceDocumentByIdAction",
        "getSourceDocumentLightAction",
        "batchUpdateSourceDocumentsAction",
        "updateSourceDocumentAction",
        "updateSourceDocumentImagesAction",
        "deleteSourceDocumentAction",
        "batchDeleteSourceDocumentsAction",
        "batchRetrySourceDocumentsAction",
        "createQuickEntryAction",
        "createSourceDocumentAction",
        "retrySourceDocumentAction",
        "getProcessingTasksAction",
        "getProcessingStatsAction",
      ],
      message:
        'Import these APIs from "@/modules/source-document/actions" instead of the module root.',
    },
  ],
  stats: [
    {
      importNames: ["getEnhancedStats", "EnhancedStats", "EnhancedCategoryStat"],
      message: 'Import these APIs from "@/modules/stats/actions" instead of the module root.',
    },
  ],
  "task-queue": [
    {
      importNames: [
        "cancelTaskAction",
        "batchCancelTasksAction",
        "dismissTaskAction",
        "batchDismissTasksAction",
        "getTaskQueueForAuthorizedLedger",
        "getTaskQueueAction",
      ],
      message:
        'Import these APIs from "@/modules/task-queue/actions" instead of the module root.',
    },
  ],
};

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
          message:
            "Cross-feature imports must go through the target feature's public entrypoint.",
        },
      ],
    },
  ];
}

function createModuleRootImportRestrictions(targetModules) {
  return targetModules.flatMap((moduleName) => {
    const restrictions = moduleRootRestrictedImports[moduleName];
    if (restrictions == null) return [];

    return restrictions.map((restriction) => ({
      name: `@/modules/${moduleName}`,
      importNames: restriction.importNames,
      message: restriction.message,
    }));
  });
}

function createDeepModuleImportPatterns(targetModules) {
  return targetModules.map((moduleName) => `@/modules/${moduleName}/*/**`);
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
      {
        group: createDeepModuleImportPatterns(disallowedModules),
        message: "Cross-module imports must go through the target module's public entrypoint.",
      },
    ],
    paths: createModuleRootImportRestrictions(disallowedModules),
  };
}

function createApplicationLayerBoundaryRule(currentModule) {
  const baseOptions = createCrossModuleBoundaryOptions(currentModule);
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
  globalIgnores([".next/**", ".worktrees/**", "out/**", "build/**", "next-env.d.ts", "coverage/**"]),
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
    files: ["src/app/**/*.ts", "src/app/**/*.tsx", "src/components/**/*.ts", "src/components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: createModuleRootImportRestrictions(moduleNames),
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
            {
              group: createDeepModuleImportPatterns(moduleNames),
              message: "App and shared UI code must import modules via public entrypoints.",
            },
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
            {
              name: "@/modules/auth/helpers",
              message:
                'Shared library/types code must not depend on auth module helpers. Use lib-level auth primitives instead.',
            },
            {
              name: "@/modules/ledger/mappers",
              message:
                'Shared library/types code must not depend on ledger module mappers. Keep domain mapping inside the owning module.',
            },
            {
              name: "@/modules/source-document/mappers",
              message:
                'Shared library/types code must not depend on source-document module mappers. Keep domain mapping inside the owning module.',
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
            {
              group: createDeepModuleImportPatterns(moduleNames),
              message: "Shared library/types code must not deep-import module internals.",
            },
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
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: LEGACY_FEATURE_IMPORT_PATTERNS,
              message: "Tests must import modules or lib paths, not removed feature paths.",
            },
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
