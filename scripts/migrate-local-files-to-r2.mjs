import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import pg from "pg";
import {
  assertSafeObjectKey,
  parseMode,
  requireMaintenanceConfirmation,
  sha256,
  verifyFileContents,
  verifyLocalContents,
} from "./r2-migration-lib.mjs";

const { Client } = pg;
const ADVISORY_LOCK_NAME = "cashier-r2-storage-migration-v1";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function createR2() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

async function bodyBytes(response, key) {
  if (response.Body == null) throw new Error(`R2 object has no body: ${key}`);
  return Buffer.from(await response.Body.transformToByteArray());
}

async function downloadR2(r2, bucket, key) {
  return bodyBytes(await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key })), key);
}

async function listR2Keys(r2, bucket) {
  const keys = [];
  let continuationToken;
  do {
    const result = await r2.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken })
    );
    for (const object of result.Contents ?? []) if (object.Key != null) keys.push(object.Key);
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken != null);
  return keys;
}

async function assertNoOpenUploads(client) {
  const result = await client.query(
    `SELECT id FROM upload_sessions
     WHERE status = 'open' AND expires_at > now()
     LIMIT 10`
  );
  if (result.rowCount > 0) {
    throw new Error(
      `Found ${result.rowCount} unexpired open upload session(s); keep writes frozen and wait for expiry`
    );
  }
}

async function loadRows(client, provider) {
  return (
    await client.query(
      `SELECT id, storage_provider, storage_key, content_type, byte_size, checksum
       FROM stored_files
       WHERE storage_provider = $1 AND deleted_at IS NULL
       ORDER BY storage_key`,
      [provider]
    )
  ).rows;
}

async function loadMigrationRows(client) {
  const localRows = await loadRows(client, "local");
  const legacyInlineRows = (
    await client.query(
      `SELECT DISTINCT ON (sf.id)
              sf.id, sf.storage_provider, sf.storage_key, sf.content_type,
              sf.byte_size, sf.checksum, rf.position, sd.image_urls
       FROM stored_files sf
       JOIN revision_files rf
         ON rf.stored_file_id = sf.id AND rf.ledger_id = sf.ledger_id
       JOIN source_document_revisions sdr
         ON sdr.id = rf.revision_id AND sdr.ledger_id = rf.ledger_id
       JOIN source_documents sd
         ON sd.id = sdr.source_document_id AND sd.ledger_id = sdr.ledger_id
       WHERE sf.storage_provider = 'legacy-inline'
         AND sf.deleted_at IS NULL
       ORDER BY sf.id, rf.position`
    )
  ).rows;
  return [...localRows, ...legacyInlineRows].sort((a, b) =>
    a.storage_key.localeCompare(b.storage_key)
  );
}

async function readLocalFile(localRoot, key) {
  assertSafeObjectKey(key);
  const root = await fs.realpath(localRoot);
  const requested = path.resolve(root, key);
  const relativeRequested = path.relative(root, requested);
  if (relativeRequested.startsWith("..") || path.isAbsolute(relativeRequested)) {
    throw new Error(`Local file escapes storage root: ${key}`);
  }
  const info = await fs.lstat(requested);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`Local storage path is not a regular file: ${key}`);
  }
  const actual = await fs.realpath(requested);
  const relativeActual = path.relative(root, actual);
  if (relativeActual.startsWith("..") || path.isAbsolute(relativeActual)) {
    throw new Error(`Local file resolves outside storage root: ${key}`);
  }
  return fs.readFile(actual);
}

function readLegacyInlineFile(row) {
  const imageUrls = Array.isArray(row.image_urls) ? row.image_urls : [];
  const source = imageUrls[row.position];
  const match = /^data:([^;,]+);base64,(.+)$/.exec(source ?? "");
  if (match == null)
    throw new Error(`Legacy inline image is not a valid data URI: ${row.storage_key}`);
  if (match[1] !== row.content_type) {
    throw new Error(`Legacy inline content type differs from database: ${row.storage_key}`);
  }
  return Buffer.from(match[2], "base64");
}

async function readMigrationSource(localRoot, row) {
  if (row.storage_provider === "local") {
    return readLocalFile(localRoot, row.storage_key);
  }
  if (row.storage_provider === "legacy-inline") {
    return readLegacyInlineFile(row);
  }
  throw new Error(`Unsupported migration source provider: ${row.storage_provider}`);
}

async function validateLocalCopies(client, localRoot) {
  await assertNoOpenUploads(client);
  const rows = await loadMigrationRows(client);
  const verified = [];
  const failures = [];
  for (const row of rows) {
    try {
      const key = assertSafeObjectKey(row.storage_key);
      const bytes = await readMigrationSource(localRoot, row);
      const result = verifyLocalContents(row, bytes);
      if (result.failures.length > 0) failures.push({ key, reasons: result.failures });
      else verified.push({ row, key, localHash: result.localHash });
    } catch (error) {
      failures.push({
        key: row.storage_key,
        reasons: [error instanceof Error ? error.message : String(error)],
      });
    }
  }
  return { rows, verified, failures };
}

async function uploadLocalCopies(r2, bucket, localRoot, verified) {
  const concurrency = 6;
  let uploaded = 0;
  for (let offset = 0; offset < verified.length; offset += concurrency) {
    const batch = verified.slice(offset, offset + concurrency);
    await Promise.all(
      batch.map(async ({ row, key, localHash }) => {
        const bytes = await readMigrationSource(localRoot, row);
        if (sha256(bytes) !== localHash) {
          throw new Error(`Local file changed after validation: ${key}`);
        }
        await r2.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bytes,
            ContentType: row.content_type,
          })
        );
      })
    );
    uploaded += batch.length;
    console.log(`Uploaded ${uploaded}/${verified.length} object(s)`);
  }
}

function toApplySnapshots(localReport) {
  return localReport.verified.map(({ row, key }) => ({
    id: row.id,
    key,
    byteSize: Number(row.byte_size),
    checksum: row.checksum,
    provider: row.storage_provider,
  }));
}

function printLocalFailures(localReport) {
  for (const failure of localReport.failures) {
    console.error(`LOCAL_INVALID ${failure.key}: ${failure.reasons.join("; ")}`);
  }
  if (localReport.failures.length > 0) {
    throw new Error("Local validation failed; R2 and database were not changed");
  }
}

async function validateMigration(client, r2, bucket, localRoot) {
  await assertNoOpenUploads(client);
  const rows = await loadMigrationRows(client);
  const verified = [];
  const failures = [];
  const concurrency = 6;

  for (let offset = 0; offset < rows.length; offset += concurrency) {
    const batch = rows.slice(offset, offset + concurrency);
    const results = await Promise.all(
      batch.map(async (row) => {
        let key = row.storage_key;
        try {
          key = assertSafeObjectKey(row.storage_key);
          const [sourceBytes, r2Bytes] = await Promise.all([
            readMigrationSource(localRoot, row),
            downloadR2(r2, bucket, key),
          ]);
          const result = verifyFileContents(row, sourceBytes, r2Bytes);
          if (result.failures.length > 0) return { key, reasons: result.failures };
          return {
            verified: {
              id: row.id,
              key,
              byteSize: Number(row.byte_size),
              checksum: row.checksum,
              provider: row.storage_provider,
            },
          };
        } catch (error) {
          return {
            key,
            reasons: [error instanceof Error ? error.message : String(error)],
          };
        }
      })
    );
    for (const result of results) {
      if (result.verified != null) verified.push(result.verified);
      else failures.push({ key: result.key, reasons: result.reasons });
    }
    console.log(
      `Verified ${Math.min(offset + batch.length, rows.length)}/${rows.length} R2 object(s)`
    );
  }

  const referenced = new Set(
    (await client.query("SELECT storage_key FROM stored_files")).rows.map((row) => row.storage_key)
  );
  const extras = (await listR2Keys(r2, bucket)).filter(
    (key) => !key.startsWith("smoke-tests/") && !referenced.has(key)
  );
  return { rows, verified, failures, extras };
}

async function applyMigration(client, verified) {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK_NAME]);
    await assertNoOpenUploads(client);
    const ids = verified.map((file) => file.id);
    if (ids.length > 0) {
      const current = await client.query(
        `SELECT id, storage_provider, storage_key, byte_size, checksum
         FROM stored_files
         WHERE storage_provider IN ('local', 'legacy-inline')
           AND deleted_at IS NULL AND id = ANY($1::text[])
         FOR UPDATE`,
        [ids]
      );
      const snapshots = new Map(verified.map((file) => [file.id, file]));
      const changed = current.rows.some((row) => {
        const snapshot = snapshots.get(row.id);
        return (
          snapshot == null ||
          snapshot.provider !== row.storage_provider ||
          snapshot.key !== row.storage_key ||
          snapshot.byteSize !== Number(row.byte_size) ||
          snapshot.checksum !== row.checksum
        );
      });
      if (current.rowCount !== ids.length || changed) {
        throw new Error("Concurrent database metadata change detected; rerun validation");
      }
    }
    const result =
      ids.length === 0
        ? { rowCount: 0 }
        : await client.query(
            `UPDATE stored_files SET storage_provider = 'r2'
           WHERE storage_provider IN ('local', 'legacy-inline')
             AND deleted_at IS NULL AND id = ANY($1::text[])`,
            [ids]
          );
    if (result.rowCount !== ids.length) {
      throw new Error(
        `Concurrent database change detected: expected ${ids.length} updates, got ${result.rowCount}`
      );
    }
    const remaining = await client.query(
      `SELECT count(*)::int count FROM stored_files
       WHERE storage_provider IN ('local', 'legacy-inline') AND deleted_at IS NULL`
    );
    if (remaining.rows[0].count !== 0)
      throw new Error("Unverified local rows remain; refusing commit");
    await client.query("COMMIT");
    return result.rowCount;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function rollbackMigration(client, r2, bucket, localRoot) {
  await assertNoOpenUploads(client);
  const rows = await loadRows(client, "r2");
  for (const row of rows) {
    const key = assertSafeObjectKey(row.storage_key);
    const bytes = await downloadR2(r2, bucket, key);
    if (bytes.length !== Number(row.byte_size)) throw new Error(`R2 size mismatch: ${key}`);
    if (row.checksum != null && sha256(bytes) !== row.checksum.toLowerCase()) {
      throw new Error(`R2 checksum mismatch: ${key}`);
    }
    const destination = path.join(localRoot, key);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes, { flag: "wx" }).catch(async (error) => {
      if (error.code !== "EEXIST") throw error;
      const existing = await fs.readFile(destination);
      if (sha256(existing) !== sha256(bytes))
        throw new Error(`Existing local file differs: ${key}`);
    });
  }

  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK_NAME]);
    await assertNoOpenUploads(client);
    const ids = rows.map((row) => row.id);
    const result =
      ids.length === 0
        ? { rowCount: 0 }
        : await client.query(
            `UPDATE stored_files SET storage_provider = 'local'
           WHERE storage_provider = 'r2' AND deleted_at IS NULL AND id = ANY($1::text[])`,
            [ids]
          );
    if (result.rowCount !== ids.length)
      throw new Error("Concurrent database change detected during rollback");
    await client.query("COMMIT");
    return result.rowCount;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function smoke(r2, bucket) {
  const key = `smoke-tests/${crypto.randomUUID()}`;
  const bytes = crypto.randomBytes(64);
  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: "application/octet-stream",
      })
    );
    const downloaded = await downloadR2(r2, bucket, key);
    if (sha256(downloaded) !== sha256(bytes)) throw new Error("R2 smoke checksum mismatch");
  } finally {
    await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
  console.log(`R2 smoke test passed: ${key}`);
}

export async function main(argv = process.argv.slice(2)) {
  const mode = parseMode(argv);
  requireMaintenanceConfirmation(mode, argv);
  const bucket = requiredEnv("R2_BUCKET_NAME");
  const r2 = createR2();
  if (mode === "smoke") return smoke(r2, bucket);

  const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required");
  const localRoot = path.resolve(requiredEnv("LOCAL_STORAGE_PATH"));
  const skipR2Verification = argv.includes("--skip-r2-verification");
  const client = new Client({ connectionString });
  let clientConnected = false;
  client.on("error", (error) => {
    console.error(`Database connection error: ${error.message}`);
  });
  await client.connect();
  clientConnected = true;
  try {
    if (mode === "rollback") {
      const count = await rollbackMigration(client, r2, bucket, localRoot);
      console.log(`Rollback completed: ${count} row(s) restored to local for the previous image`);
      return;
    }

    if (mode === "upload") {
      const localReport = await validateLocalCopies(client, localRoot);
      console.log(
        `Validated ${localReport.verified.length}/${localReport.rows.length} migration source file(s) before upload`
      );
      printLocalFailures(localReport);
      await client.end();
      clientConnected = false;
      await uploadLocalCopies(r2, bucket, localRoot, localReport.verified);
      console.log("R2 upload complete; database was not changed");
      return;
    }

    if (mode === "apply" && skipR2Verification) {
      const localReport = await validateLocalCopies(client, localRoot);
      console.log(
        `Validated ${localReport.verified.length}/${localReport.rows.length} migration source file(s) before apply`
      );
      printLocalFailures(localReport);
      console.warn("Skipping R2 content verification by explicit request");
      const count = await applyMigration(client, toApplySnapshots(localReport));
      console.log(`Migration applied: ${count} row(s) switched to r2`);
      return;
    }

    const report = await validateMigration(client, r2, bucket, localRoot);
    console.log(
      `Validated ${report.verified.length}/${report.rows.length} migration source file(s)`
    );
    for (const failure of report.failures)
      console.error(`REUPLOAD ${failure.key}: ${failure.reasons.join("; ")}`);
    for (const key of report.extras) console.warn(`EXTRA_R2_OBJECT ${key}`);
    if (report.failures.length > 0)
      throw new Error("Migration validation failed; database was not changed");
    if (mode === "apply") {
      const count = await applyMigration(client, report.verified);
      console.log(`Migration applied: ${count} row(s) switched to r2`);
    } else if (mode === "dry-run") {
      console.log("Dry-run complete; database was not changed");
    } else {
      console.log("R2 upload and verification complete; database was not changed");
    }
  } finally {
    if (clientConnected) await client.end().catch(() => undefined);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
