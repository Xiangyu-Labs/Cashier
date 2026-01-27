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
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
