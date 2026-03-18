import { flowEngine } from "@/lib/flow";
import { categorizeEntryTaskDefinition } from "@/features/ledger/server/tasks/categorize-entry";
import { generateCategoryMetadataTaskDefinition } from "@/features/ledger/server/tasks/generate-category-metadata";
import { parseSourceDocumentTaskDefinition } from "@/features/source-document/server/tasks/parse-source-document";

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

/**
 * Get list of registered task types for debugging/monitoring.
 */
export function getRegisteredTaskTypes(): string[] {
  return [
    parseSourceDocumentTaskDefinition.type,
    generateCategoryMetadataTaskDefinition.type,
    categorizeEntryTaskDefinition.type,
  ];
}
