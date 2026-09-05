import path from "node:path";
import ts from "typescript";

export function collectImportSpecifiers(source, fileName = "source.ts") {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const specifiers = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier != null &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

export function normalizeImportSpecifier(relativePath, specifier) {
  if (!specifier.startsWith(".")) return specifier;
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(relativePath), specifier)
  );
  if (!resolved.startsWith("src/")) return specifier;
  return `@/${resolved.slice("src/".length).replace(/\.(?:tsx?|mts|mjs)$/, "")}`;
}
