import { loadPerfSeedConfigFromEnv, seedPerfDatabase } from "@/lib/perf/seed";

async function main() {
  const config = loadPerfSeedConfigFromEnv();
  const manifest = await seedPerfDatabase(config);

  console.log("Performance seed completed.");
  console.log(`Database: ${manifest.sqlitePath}`);
  console.log(`Manifest: ${config.manifestPath}`);
  console.log(`Ledger ID: ${manifest.ledgerId}`);
  console.log(`API Key: ${manifest.apiKey}`);
  console.log(
    `Seeded ${manifest.categoryCount} categories, ${manifest.sourceDocumentCount} source documents, ${manifest.entryCount} entries, ${manifest.taskRunCount} tasks.`
  );
}

main().catch((error) => {
  console.error("Performance seed failed.");
  console.error(error);
  process.exit(1);
});
