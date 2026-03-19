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

function createDeepModuleImportPatterns(targetModules) {
  return targetModules.flatMap((moduleName) => [
    `@/modules/${moduleName}/server-actions/**`,
    `@/modules/${moduleName}/application/**`,
    `@/modules/${moduleName}/infra/**`,
    `@/modules/${moduleName}/domain/**`,
    `@/modules/${moduleName}/services/*`,
    `@/modules/${moduleName}/helpers/*`,
    `@/modules/${moduleName}/ui/*/*`,
    `@/modules/${moduleName}/hooks/*/*`,
  ]);
}

function createCrossModuleBoundaryRule(currentModule) {
  const disallowedModules = moduleNames.filter((moduleName) => moduleName !== currentModule);
  return [
    "error",
    {
      patterns: [
        {
          group: createDeepModuleImportPatterns(disallowedModules),
          message: "Cross-module imports must go through the target module's public entrypoint.",
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
          patterns: [
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
          patterns: [
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
    files: ["src/lib/flow/**/*.ts", "src/lib/flow/**/*.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  ...featureNames.flatMap((featureName) => createFeatureBoundaryConfigs(featureName)),
  ...moduleNames.map((moduleName) => ({
    files: [`src/modules/${moduleName}/**/*.ts`, `src/modules/${moduleName}/**/*.tsx`],
    rules: {
      "no-restricted-imports": createCrossModuleBoundaryRule(moduleName),
    },
  })),
]);

export default eslintConfig;
