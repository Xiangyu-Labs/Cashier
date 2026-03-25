import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

const moduleUrl = pathToFileURL(path.resolve("scripts/grant-super-admin.mjs")).href;

async function loadScriptModule() {
  return import(moduleUrl);
}

describe("grant-super-admin script helpers", () => {
  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("prefers DATABASE_URL from process.env", async () => {
    process.env.DATABASE_URL = "file:./data/from-env.db";
    const { resolveDatabaseUrl } = await loadScriptModule();

    expect(resolveDatabaseUrl({ cwd: "/tmp/project" })).toBe("file:./data/from-env.db");
  });

  it("falls back to .env.local before .env", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-admin-env-"));
    fs.writeFileSync(path.join(cwd, ".env"), "DATABASE_URL=file:./data/from-dot-env.db\n");
    fs.writeFileSync(path.join(cwd, ".env.local"), "DATABASE_URL=file:./data/from-dot-env-local.db\n");

    try {
      const { resolveDatabaseUrl } = await loadScriptModule();
      expect(resolveDatabaseUrl({ cwd, env: {} })).toBe("file:./data/from-dot-env-local.db");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("updates an existing user to super_admin", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-admin-db-"));
    const dbPath = path.join(cwd, "sqlite.db");
    const db = new Database(dbPath);

    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'user'
      );
    `);
    db.prepare("INSERT INTO users (id, email, role) VALUES (?, ?, ?)").run(
      "user-1",
      "xiangyu.moe.ac@gmail.com",
      "user"
    );

    try {
      const { grantSuperAdminByEmail } = await loadScriptModule();
      const row = grantSuperAdminByEmail({ dbPath, email: "xiangyu.moe.ac@gmail.com" });

      expect(row).toMatchObject({
        id: "user-1",
        email: "xiangyu.moe.ac@gmail.com",
        role: "super_admin",
      });
    } finally {
      db.close();
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("throws when the user does not exist", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-admin-db-"));
    const dbPath = path.join(cwd, "sqlite.db");
    const db = new Database(dbPath);

    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'user'
      );
    `);

    try {
      const { grantSuperAdminByEmail } = await loadScriptModule();
      expect(() =>
        grantSuperAdminByEmail({ dbPath, email: "missing@example.com" })
      ).toThrow("No user found for email: missing@example.com");
    } finally {
      db.close();
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("throws when the users table has no role column", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-admin-db-"));
    const dbPath = path.join(cwd, "sqlite.db");
    const db = new Database(dbPath);

    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE
      );
    `);

    try {
      const { grantSuperAdminByEmail } = await loadScriptModule();
      expect(() =>
        grantSuperAdminByEmail({ dbPath, email: "xiangyu.moe.ac@gmail.com" })
      ).toThrow("users.role column not found");
    } finally {
      db.close();
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
