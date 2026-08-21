#!/usr/bin/env node
// Drizzle generates migrations from the newest snapshot in meta/.
// Drizzle compares the schema to the newest snapshot, so generation is only
// safe when that snapshot has caught up with the journal. Hand-written SQL is
// tracked separately in meta/manual-migrations.json.
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
