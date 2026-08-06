#!/usr/bin/env node
// Drizzle generates migrations from the newest snapshot in meta/.
// The journal is deliberately ahead of the snapshots: 0015..0022 are
// hand-written SQL migrations, so `drizzle-kit generate` would emit duplicate
// migrations for changes that already shipped. Until the snapshot is rebaselined
// against the live schema, generation must be refused.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const migrationsDirectory = path.resolve("src/persistence/postgres-migrations");
const metaDirectory = path.join(migrationsDirectory, "meta");
const journal = JSON.parse(readFileSync(path.join(metaDirectory, "_journal.json"), "utf8"));
const snapshotFiles = readdirSync(metaDirectory)
  .filter((file) => /^\d{4}_snapshot\.json$/.test(file))
  .sort();

const lastJournalEntry = journal.entries?.at(-1);
const newestSnapshotFile = snapshotFiles.at(-1);
const newestSnapshotPrefix = newestSnapshotFile?.slice(0, 4);

if (lastJournalEntry == null || newestSnapshotPrefix == null) {
  throw new Error("Cannot evaluate migration baseline: journal or snapshots are missing");
}

const journalPrefix = lastJournalEntry.tag.split("_")[0];
if (journalPrefix > newestSnapshotPrefix) {
  console.error(
    `[db:generate] blocked: migration journal is at ${lastJournalEntry.tag} but the newest ` +
      `Drizzle snapshot is ${newestSnapshotFile}. ` +
      "Generating now would emit duplicate migrations for hand-written SQL that already shipped. " +
      "Rebaseline the snapshot against the live schema first (manually), then rerun `npm run db:generate`."
  );
  process.exit(1);
}

console.log("[db:generate] snapshot baseline is current; proceeding.");
