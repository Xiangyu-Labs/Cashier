#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { collectProductionInventory } from "./production-data-inventory.mjs";

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

try {
  const args = process.argv.slice(2);
  const destinationIndex = args.indexOf("--backup");
  if (args.includes("--help")) {
    console.log("Usage: npm run ops:verify-backup -- --backup <backup-directory>");
    process.exit(0);
  }
  if (destinationIndex === -1 || args[destinationIndex + 1] == null) {
    throw new Error("--backup is required");
  }
  const backupRoot = path.resolve(args[destinationIndex + 1]);
  const manifestPath = path.join(backupRoot, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("Backup manifest does not exist");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.formatVersion !== 1 || manifest.writeFreezeConfirmed !== true) {
    throw new Error("Backup manifest is invalid or lacks write-freeze confirmation");
  }

  let verifiedFiles = 0;
  let verifiedBytes = 0;
  for (const file of manifest.database.files) {
    const filePath = path.join(backupRoot, "database", file.fileName);
    if (!existsSync(filePath) || sha256(filePath) !== file.sha256) {
      throw new Error("Database backup checksum verification failed");
    }
    verifiedFiles += 1;
    verifiedBytes += file.bytes;
  }
  for (const file of manifest.uploads.files) {
    const filePath = path.join(backupRoot, "uploads", file.relativePath);
    if (!existsSync(filePath) || sha256(filePath) !== file.sha256) {
      throw new Error("Upload backup checksum verification failed");
    }
    verifiedFiles += 1;
    verifiedBytes += file.bytes;
  }

  const inventory = collectProductionInventory({
    databasePath: path.join(backupRoot, "database", manifest.database.primaryFile),
    uploadsPath: path.join(backupRoot, "uploads"),
  });
  console.log(
    JSON.stringify({
      formatVersion: 1,
      checksums: "ok",
      verifiedFiles,
      verifiedBytes,
      databaseQuickCheck: inventory.integrity.quickCheck,
      foreignKeyViolations: inventory.integrity.foreignKeyViolations,
      sourceDocumentRows: inventory.tableCounts.source_documents ?? 0,
      localFiles: inventory.localFiles.files,
      missingLocalReferences: inventory.sourceDocuments?.images.missingLocalReferences ?? 0,
    })
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
