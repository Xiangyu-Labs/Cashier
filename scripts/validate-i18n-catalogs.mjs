#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

if (referenceCatalog == null) {
  errors.push(`Reference catalog ${referenceCatalogFile} could not be parsed.`);
} else {
  const referenceKeys = new Set(flattenKeys(referenceCatalog));

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

if (errors.length > 0) {
  console.error("i18n catalog validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validated ${catalogFiles.length} locale catalogs successfully.`);
