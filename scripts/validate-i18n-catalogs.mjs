#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const messagesDir = path.resolve(currentDirPath, "..", "messages");
const featureMapPath = path.resolve(
  currentDirPath,
  "..",
  "src",
  "i18n",
  "client-feature-message-map.json"
);
const messageVersionPath = path.resolve(
  currentDirPath,
  "..",
  "src",
  "i18n",
  "feature-message-version.ts"
);
const catalogFiles = fs
  .readdirSync(messagesDir)
  .filter((fileName) => fileName.endsWith(".json"))
  .sort();

if (catalogFiles.length === 0) {
  console.error("No locale catalogs found in messages/.");
  process.exit(1);
}

function getDuplicateTopLevelKeys(content) {
  const matches = content.matchAll(/^ {2}"([^"]+)":/gm);
  const seen = new Set();
  const duplicates = new Set();

  for (const match of matches) {
    const key = match[1];
    if (seen.has(key)) {
      duplicates.add(key);
      continue;
    }
    seen.add(key);
  }

  return [...duplicates].sort();
}

function flattenKeys(value, prefix = "") {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nextPrefix = prefix === "" ? key : `${prefix}.${key}`;
    return [nextPrefix, ...flattenKeys(nestedValue, nextPrefix)];
  });
}

const parsedCatalogs = new Map();
const errors = [];
let featureMap = {};

try {
  featureMap = JSON.parse(fs.readFileSync(featureMapPath, "utf8"));
} catch (error) {
  errors.push(
    `feature message map is invalid: ${error instanceof Error ? error.message : String(error)}`
  );
}

try {
  const sourceCatalogs = Object.fromEntries(
    catalogFiles.map((catalogFile) => [
      path.basename(catalogFile, ".json"),
      fs.readFileSync(path.join(messagesDir, catalogFile), "utf8"),
    ])
  );
  const expectedVersion = crypto
    .createHash("sha256")
    .update(JSON.stringify(featureMap))
    .update(JSON.stringify(sourceCatalogs))
    .digest("hex")
    .slice(0, 16);
  const versionSource = fs.readFileSync(messageVersionPath, "utf8");
  const actualVersion = versionSource.match(/FEATURE_MESSAGE_VERSION\s*=\s*"([a-f0-9]+)"/)?.[1];
  if (actualVersion !== expectedVersion) {
    errors.push(
      `feature-message-version.ts is stale: expected ${expectedVersion}, found ${actualVersion ?? "missing"}`
    );
  }
} catch (error) {
  errors.push(
    `feature message version is invalid: ${error instanceof Error ? error.message : String(error)}`
  );
}

for (const catalogFile of catalogFiles) {
  const filePath = path.join(messagesDir, catalogFile);
  const rawContent = fs.readFileSync(filePath, "utf8");
  const duplicateTopLevelKeys = getDuplicateTopLevelKeys(rawContent);

  if (duplicateTopLevelKeys.length > 0) {
    errors.push(
      `${catalogFile}: duplicate top-level keys detected: ${duplicateTopLevelKeys.join(", ")}`
    );
  }

  try {
    parsedCatalogs.set(catalogFile, JSON.parse(rawContent));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${catalogFile}: invalid JSON: ${message}`);
  }
}

for (const [feature, namespaces] of Object.entries(featureMap)) {
  if (!Array.isArray(namespaces) || namespaces.some((namespace) => typeof namespace !== "string")) {
    errors.push(`${feature}: feature namespace list must contain strings only`);
    continue;
  }
  for (const catalogFile of catalogFiles) {
    const locale = path.basename(catalogFile, ".json");
    const rootCatalog = parsedCatalogs.get(catalogFile);
    const featurePath = path.join(messagesDir, locale, `${feature}.json`);
    if (rootCatalog == null) continue;
    if (!fs.existsSync(featurePath)) {
      errors.push(`${locale}/${feature}.json: missing feature catalog`);
      continue;
    }
    let actual;
    try {
      actual = JSON.parse(fs.readFileSync(featurePath, "utf8"));
    } catch (error) {
      errors.push(
        `${locale}/${feature}.json: invalid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }
    const expected = Object.fromEntries(
      namespaces
        .filter((namespace) => namespace in rootCatalog)
        .map((namespace) => [namespace, rootCatalog[namespace]])
    );
    const missingNamespaces = namespaces.filter((namespace) => !(namespace in rootCatalog));
    if (missingNamespaces.length > 0) {
      errors.push(
        `${catalogFile}: feature ${feature} references missing namespaces: ${missingNamespaces.join(", ")}`
      );
    }
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(`${locale}/${feature}.json: content differs from ${catalogFile}`);
    }
  }
}

const referenceCatalogFile = catalogFiles.includes("en.json") ? "en.json" : catalogFiles[0];
const referenceCatalog = parsedCatalogs.get(referenceCatalogFile);
const referenceKeys = new Set();

if (referenceCatalog == null) {
  errors.push(`Reference catalog ${referenceCatalogFile} could not be parsed.`);
} else {
  for (const key of flattenKeys(referenceCatalog)) referenceKeys.add(key);

  for (const catalogFile of catalogFiles) {
    if (catalogFile === referenceCatalogFile) {
      continue;
    }

    const catalog = parsedCatalogs.get(catalogFile);
    if (catalog == null) {
      continue;
    }

    const currentKeys = new Set(flattenKeys(catalog));
    const missingKeys = [...referenceKeys].filter((key) => !currentKeys.has(key));
    const extraKeys = [...currentKeys].filter((key) => !referenceKeys.has(key));

    if (missingKeys.length > 0) {
      errors.push(`${catalogFile}: missing keys: ${missingKeys.join(", ")}`);
    }

    if (extraKeys.length > 0) {
      errors.push(`${catalogFile}: extra keys: ${extraKeys.join(", ")}`);
    }
  }
}

function sourceFilesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesIn(entryPath);
    return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

function literalText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function getMessageValue(catalog, key) {
  return key.split(".").reduce((value, segment) => {
    if (value == null || typeof value !== "object" || !(segment in value)) return undefined;
    return value[segment];
  }, catalog);
}

function collectTranslationUsages(sourceFile) {
  const useTranslationNames = new Set(["useTranslations"]);
  const bindings = new Map();
  const usages = [];
  const rawKeyLiterals = [];

  function visit(node) {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings != null) {
      const namedBindings = node.importClause.namedBindings;
      if (ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          if (
            element.propertyName?.text === "useTranslations" ||
            element.name.text === "useTranslations"
          ) {
            useTranslationNames.add(element.name.text);
          }
        }
      }
    }

    if (ts.isVariableDeclaration(node)) {
      const initializer = node.initializer;
      if (
        ts.isIdentifier(node.name) &&
        initializer != null &&
        ts.isCallExpression(initializer) &&
        ts.isIdentifier(initializer.expression) &&
        useTranslationNames.has(initializer.expression.text)
      ) {
        const namespace = literalText(initializer.arguments[0]);
        if (namespace != null) bindings.set(node.name.text, namespace);
      }
    }

    if (ts.isCallExpression(node)) {
      let bindingName = null;
      let method = "translate";
      if (ts.isIdentifier(node.expression)) {
        bindingName = node.expression.text;
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression)
      ) {
        bindingName = node.expression.expression.text;
        method = node.expression.name.text;
      }

      const namespace = bindingName == null ? undefined : bindings.get(bindingName);
      if (namespace != null && ["translate", "raw", "rich", "markup", "has"].includes(method)) {
        const key = literalText(node.arguments[0]);
        if (key != null) {
          usages.push({
            fileName: sourceFile.fileName,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            namespace,
            key,
            reason: null,
          });
        }
      }
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      const isUseTranslationsArgument =
        ts.isCallExpression(parent) &&
        ts.isIdentifier(parent.expression) &&
        useTranslationNames.has(parent.expression.text);
      if (!isUseTranslationsArgument && referenceKeys.has(node.text) && node.text.includes(".")) {
        rawKeyLiterals.push({
          fileName: sourceFile.fileName,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          key: node.text,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { usages, rawKeyLiterals };
}

if (referenceCatalog != null) {
  const sourceRoot = path.resolve(currentDirPath, "..", "src");
  const locales = catalogFiles.map((fileName) => path.basename(fileName, ".json"));
  const featureCatalogs = new Map();

  for (const feature of Object.keys(featureMap)) {
    featureCatalogs.set(
      feature,
      new Map(
        locales.map((locale) => {
          const featurePath = path.join(messagesDir, locale, `${feature}.json`);
          if (!fs.existsSync(featurePath)) return [locale, null];
          try {
            return [locale, JSON.parse(fs.readFileSync(featurePath, "utf8"))];
          } catch {
            return [locale, null];
          }
        })
      )
    );
  }

  for (const fileName of sourceFilesIn(sourceRoot)) {
    const source = fs.readFileSync(fileName, "utf8");
    const sourceFile = ts.createSourceFile(
      fileName,
      source,
      ts.ScriptTarget.Latest,
      true,
      fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const { usages, rawKeyLiterals } = collectTranslationUsages(sourceFile);
    const relativeFileName = path.relative(path.resolve(currentDirPath, ".."), fileName);

    for (const usage of usages) {
      const location = `${relativeFileName}:${usage.line}`;
      if (usage.reason != null) {
        errors.push(`${location}: ${usage.reason}`);
        continue;
      }
      const fullKey = `${usage.namespace}.${usage.key}`;
      for (const locale of locales) {
        const catalog = parsedCatalogs.get(`${locale}.json`);
        if (getMessageValue(catalog, fullKey) === undefined) {
          errors.push(`${location}: missing ${locale} message key ${fullKey}`);
        }
      }

      for (const [feature, catalogs] of featureCatalogs) {
        const namespaces = featureMap[feature];
        if (!Array.isArray(namespaces) || !namespaces.includes(usage.namespace)) continue;
        for (const locale of locales) {
          const catalog = catalogs.get(locale);
          if (getMessageValue(catalog, fullKey) === undefined) {
            errors.push(`${location}: ${fullKey} is missing from ${locale}/${feature}.json`);
          }
        }
      }
    }

    for (const rawKey of rawKeyLiterals) {
      errors.push(
        `${relativeFileName}:${rawKey.line}: raw translation key rendered directly: ${rawKey.key}`
      );
    }
  }
}

if (errors.length > 0) {
  console.error("i18n catalog validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validated ${catalogFiles.length} locale catalogs successfully.`);
