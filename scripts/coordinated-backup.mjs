#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { resolveDatabasePath } from "./production-data-inventory.mjs";

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function parseArgs(argv) {
  const options = {
    database: process.env.DATABASE_URL ?? "file:./data/sqlite.db",
    uploads: process.env.LOCAL_STORAGE_PATH ?? "./data/uploads",
    destination: null,
    writeFreezeConfirmed: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--database") options.database = argv[++index];
    else if (arg === "--uploads") options.uploads = argv[++index];
    else if (arg === "--destination") options.destination = argv[++index];
    else if (arg === "--write-freeze-confirmed") options.writeFreezeConfirmed = true;
    else if (arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function copyUploads(sourceRoot, destinationRoot, manifestFiles, relativeDirectory = "") {
  for (const entry of readdirSync(path.join(sourceRoot, relativeDirectory), {
    withFileTypes: true,
  })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    const sourcePath = path.join(sourceRoot, relativePath);
    const destinationPath = path.join(destinationRoot, relativePath);
    if (entry.isSymbolicLink()) {
      throw new Error("Upload backup refuses symbolic links");
    }
    if (entry.isDirectory()) {
      mkdirSync(destinationPath, { recursive: true });
      copyUploads(sourceRoot, destinationRoot, manifestFiles, relativePath);
    } else if (entry.isFile()) {
      mkdirSync(path.dirname(destinationPath), { recursive: true });
      copyFileSync(sourcePath, destinationPath);
      const stat = lstatSync(destinationPath);
      manifestFiles.push({
        relativePath: relativePath.split(path.sep).join("/"),
        bytes: stat.size,
        sha256: sha256(destinationPath),
      });
    } else {
      throw new Error("Upload backup encountered an unsupported filesystem entry");
    }
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: npm run ops:backup -- --destination <new-directory> --write-freeze-confirmed [--database <path>] [--uploads <path>]"
    );
    process.exit(0);
  }
  if (!options.writeFreezeConfirmed) {
    throw new Error("Refusing backup without --write-freeze-confirmed");
  }
  if (typeof options.destination !== "string" || options.destination === "") {
    throw new Error("--destination is required");
  }
  if (typeof options.database !== "string" || typeof options.uploads !== "string") {
    throw new Error("--database and --uploads require values");
  }

  const databasePath = resolveDatabasePath(options.database);
  const uploadsPath = path.resolve(options.uploads);
  const destination = path.resolve(options.destination);
  if (!existsSync(databasePath)) throw new Error("SQLite database does not exist");
  if (!existsSync(uploadsPath)) throw new Error("Upload root does not exist");
  if (existsSync(destination)) throw new Error("Backup destination already exists");

  const databaseDestination = path.join(destination, "database");
  const uploadsDestination = path.join(destination, "uploads");
  mkdirSync(databaseDestination, { recursive: true });
  mkdirSync(uploadsDestination, { recursive: true });

  const databaseFiles = [];
  for (const sourcePath of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (!existsSync(sourcePath)) continue;
    const fileName = path.basename(sourcePath);
    const destinationPath = path.join(databaseDestination, fileName);
    copyFileSync(sourcePath, destinationPath);
    const stat = lstatSync(destinationPath);
    databaseFiles.push({ fileName, bytes: stat.size, sha256: sha256(destinationPath) });
  }

  const uploadFiles = [];
  copyUploads(uploadsPath, uploadsDestination, uploadFiles);
  const manifest = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    writeFreezeConfirmed: true,
    database: { primaryFile: path.basename(databasePath), files: databaseFiles },
    uploads: { files: uploadFiles },
  };
  writeFileSync(path.join(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });

  console.log(
    JSON.stringify({
      formatVersion: 1,
      databaseFiles: databaseFiles.length,
      databaseBytes: databaseFiles.reduce((total, file) => total + file.bytes, 0),
      uploadFiles: uploadFiles.length,
      uploadBytes: uploadFiles.reduce((total, file) => total + file.bytes, 0),
    })
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
