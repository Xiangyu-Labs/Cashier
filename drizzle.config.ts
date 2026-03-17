import { defineConfig } from "drizzle-kit";
import fs from "fs";
import path from "path";

function loadEnvLocal() {
  try {
    const envLocalPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envLocalPath)) {
      const envLocal = fs.readFileSync(envLocalPath, "utf8");
      const dbUrlMatch = envLocal.match(/^DATABASE_URL=(.+)$/m);
      if (dbUrlMatch) {
        process.env.DATABASE_URL = dbUrlMatch[1].trim();
      }
    }
  } catch (error) {
    console.warn("Failed to load .env.local:", error);
  }
}

loadEnvLocal();

export default defineConfig({
  schema: [
    "./src/features/auth/server/schema.ts",
    "./src/features/currency/server/schema.ts",
    "./src/features/ledger/server/schema.ts",
    "./src/features/source-document/server/schema.ts",
    "./src/features/task-queue/server/schema.ts",
    "./src/lib/db/relations.ts",
  ],
  out: "./src/lib/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "sqlite.db",
  },
});
