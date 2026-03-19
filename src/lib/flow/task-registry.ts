import { flowEngine, type FlowTaskHandler } from "@/lib/flow";
import { categorizeEntryTaskDefinition } from "@/modules/ledger/application/tasks/categorize-entry";
import { generateCategoryMetadataTaskDefinition } from "@/modules/ledger/application/tasks/generate-category-metadata";
import { parseSourceDocumentTaskDefinition } from "@/modules/source-document/application/tasks/parse-source-document";

let hasRegisteredTasks = false;
let registrationPromise: Promise<void> | null = null;

function registerTaskIfNeeded(name: string, handler: FlowTaskHandler<unknown, unknown>): void {
  try {
    flowEngine.register(name, handler);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.startsWith("Task handler already registered:")) {
      throw error;
    }
  }
}

/**
 * Register all task handlers with the flow engine.
 * Safe to call during startup and immediately before task submission.
 */
export async function registerAllTasks(): Promise<void> {
  if (hasRegisteredTasks) {
    return;
  }

  if (registrationPromise != null) {
    await registrationPromise;
    return;
  }

  registrationPromise = Promise.resolve().then(() => {
    if (hasRegisteredTasks) {
      return;
    }

    registerTaskIfNeeded(
      parseSourceDocumentTaskDefinition.type,
      parseSourceDocumentTaskDefinition.handler
    );
    registerTaskIfNeeded(
      generateCategoryMetadataTaskDefinition.type,
      generateCategoryMetadataTaskDefinition.handler
    );
    registerTaskIfNeeded(categorizeEntryTaskDefinition.type, categorizeEntryTaskDefinition.handler);

    hasRegisteredTasks = true;
  });

  try {
    await registrationPromise;
  } finally {
    registrationPromise = null;
  }
}
