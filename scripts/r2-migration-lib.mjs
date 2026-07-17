import crypto from "node:crypto";
import path from "node:path";

export function assertSafeObjectKey(key) {
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    path.isAbsolute(key) ||
    key.includes("\\") ||
    key.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
  return key;
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function verifyFileContents(row, localBytes, r2Bytes) {
  const failures = [];
  const localHash = sha256(localBytes);
  const r2Hash = sha256(r2Bytes);
  if (localBytes.length !== Number(row.byte_size))
    failures.push("local size differs from database");
  if (r2Bytes.length !== Number(row.byte_size)) failures.push("R2 size differs from database");
  if (row.checksum != null && localHash !== row.checksum.toLowerCase()) {
    failures.push("local checksum differs from database");
  }
  if (row.checksum != null && r2Hash !== row.checksum.toLowerCase()) {
    failures.push("R2 checksum differs from database");
  }
  if (localHash !== r2Hash) failures.push("local and R2 content differ");
  return { failures, localHash, r2Hash };
}

export function verifyLocalContents(row, localBytes) {
  const failures = [];
  const localHash = sha256(localBytes);
  if (localBytes.length !== Number(row.byte_size)) {
    failures.push("local size differs from database");
  }
  if (row.checksum != null && localHash !== row.checksum.toLowerCase()) {
    failures.push("local checksum differs from database");
  }
  return { failures, localHash };
}

export function parseMode(argv) {
  const selected = ["--upload", "--apply", "--rollback", "--smoke"].filter((flag) =>
    argv.includes(flag)
  );
  if (selected.length > 1) {
    throw new Error("Choose only one of --upload, --apply, --rollback, or --smoke");
  }
  return selected[0]?.slice(2) ?? "dry-run";
}

export function requireMaintenanceConfirmation(mode, argv) {
  if (
    (mode === "apply" || mode === "rollback") &&
    !argv.includes("--maintenance-window-confirmed")
  ) {
    throw new Error(`${mode} requires --maintenance-window-confirmed`);
  }
}
