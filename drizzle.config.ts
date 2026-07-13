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
        const databaseUrl = dbUrlMatch[1];
        if (databaseUrl != null) {
          process.env.DATABASE_URL = databaseUrl.trim();
        }
      }
    }
  } catch (error) {
    console.warn("Failed to load .env.local:", error);
  }
}

loadEnvLocal();

export default defineConfig({
  schema: [
    "./src/persistence/schema/auth.ts",
    "./src/persistence/schema/currency.ts",
    "./src/persistence/schema/ledger.ts",
    "./src/persistence/schema/source-document.ts",
    "./src/persistence/schema/application-model.ts",
    "./src/persistence/schema/task-queue.ts",
    "./src/persistence/relations.ts",
  ],
  out: "./src/persistence/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "sqlite.db",
  },
});
