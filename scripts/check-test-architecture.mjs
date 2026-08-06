#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const testRoot = path.join(root, "tests");
const sourceExtensions = [".ts", ".tsx", ".mts", ".mjs"];

function collect(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    return statSync(absolute).isDirectory()
      ? collect(absolute)
      : sourceExtensions.includes(path.extname(entry))
        ? [absolute]
        : [];
  });
}

function resolveImport(from, specifier) {
  let candidate;
  if (specifier.startsWith("tests/"))
    candidate = path.join(testRoot, specifier.slice("tests/".length));
  else if (specifier.startsWith(".")) candidate = path.resolve(path.dirname(from), specifier);
  else return null;

  for (const resolved of [
    candidate,
    ...sourceExtensions.map((extension) => candidate + extension),
    ...sourceExtensions.map((extension) => path.join(candidate, `index${extension}`)),
  ]) {
    if (existsSync(resolved) && statSync(resolved).isFile()) return resolved;
  }
  return null;
}

function staticImportSpecifiers(source) {
  const specifiers = [];
  const importPattern = /^\s*import\s+(?:(?:type\s+)?[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/gm;
  for (const match of source.matchAll(importPattern)) {
    if (match[1] != null) specifiers.push(match[1]);
  }
  return specifiers;
}

function relativePath(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function isSetupImport(file, specifier) {
  if (specifier === "tests/setup") return true;
  const resolved = resolveImport(file, specifier);
  return resolved != null && relativePath(resolved) === "tests/setup.ts";
}

const violations = [];
const unitFiles = collect(path.join(testRoot, "unit"));
const integrationFiles = collect(path.join(testRoot, "integration"));

for (const file of unitFiles) {
  const source = readFileSync(file, "utf8");
  for (const specifier of staticImportSpecifiers(source)) {
    if (isSetupImport(file, specifier)) {
      violations.push(`${relativePath(file)}: unit tests must not statically import tests/setup`);
    }
    if (specifier === "@/lib/db") {
      violations.push(`${relativePath(file)}: unit tests must not statically import @/lib/db`);
    }
    if (specifier === "pg") {
      violations.push(`${relativePath(file)}: unit tests must not import pg`);
    }
  }
  if (/\bgetTestDb\s*\(/.test(source)) {
    violations.push(`${relativePath(file)}: unit tests must not call getTestDb()`);
  }
}

for (const file of integrationFiles) {
  const source = readFileSync(file, "utf8");
  if (/\b(?:it|test|describe)\s*\.\s*concurrent\b/.test(source)) {
    violations.push(`${relativePath(file)}: integration tests must not use concurrent tests`);
  }
}

if (violations.length > 0) {
  for (const violation of violations) console.error(`Test architecture: ${violation}`);
  process.exitCode = 1;
} else {
  console.log(
    `Test architecture: ${unitFiles.length} unit files and ${integrationFiles.length} integration files comply`
  );
}
