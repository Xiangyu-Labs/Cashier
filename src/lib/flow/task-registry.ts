import { flowEngine } from "@/lib/flow";
import { categorizeEntryTaskDefinition } from "@/modules/ledger/application/tasks/categorize-entry";
import { generateCategoryMetadataTaskDefinition } from "@/modules/ledger/application/tasks/generate-category-metadata";
import { parseSourceDocumentTaskDefinition } from "@/modules/source-document/application/tasks/parse-source-document";

let hasRegisteredTasks = false;

/**
 * Register all task handlers with the flow engine.
 * Called once during application startup.
 */
export async function registerAllTasks(): Promise<void> {
  if (hasRegisteredTasks) {
    return;
  }

  flowEngine.register(parseSourceDocumentTaskDefinition.type, parseSourceDocumentTaskDefinition.handler);
  flowEngine.register(
    generateCategoryMetadataTaskDefinition.type,
    generateCategoryMetadataTaskDefinition.handler
  );
  flowEngine.register(categorizeEntryTaskDefinition.type, categorizeEntryTaskDefinition.handler);

  hasRegisteredTasks = true;
}
