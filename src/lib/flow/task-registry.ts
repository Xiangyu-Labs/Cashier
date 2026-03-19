import { categorizeEntryTaskDefinition } from "@/modules/ledger/application/tasks/categorize-entry";
import { generateCategoryMetadataTaskDefinition } from "@/modules/ledger/application/tasks/generate-category-metadata";
import { parseSourceDocumentTaskDefinition } from "@/modules/source-document/application/tasks/parse-source-document";
import type { FlowEngine, FlowTaskHandler } from "./types";

let registeredEngines = new WeakSet<FlowEngine>();
let registrationPromises = new WeakMap<FlowEngine, Promise<void>>();

function registerTaskIfNeeded(
  engine: FlowEngine,
  name: string,
  handler: FlowTaskHandler<unknown, unknown>
): void {
  try {
    engine.register(name, handler);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.startsWith("Task handler already registered:")) {
      throw error;
    }
  }
}

/**
 * Register all task handlers with the flow engine.
 * Safe to call multiple times for the same engine.
 */
export async function registerAllTasks(engine: FlowEngine): Promise<void> {
  if (registeredEngines.has(engine)) {
    return;
  }

  const existingPromise = registrationPromises.get(engine);
  if (existingPromise != null) {
    await existingPromise;
    return;
  }

  const registrationPromise = Promise.resolve().then(() => {
    if (registeredEngines.has(engine)) {
      return;
    }

    registerTaskIfNeeded(
      engine,
      parseSourceDocumentTaskDefinition.type,
      parseSourceDocumentTaskDefinition.handler
    );
    registerTaskIfNeeded(
      engine,
      generateCategoryMetadataTaskDefinition.type,
      generateCategoryMetadataTaskDefinition.handler
    );
    registerTaskIfNeeded(
      engine,
      categorizeEntryTaskDefinition.type,
      categorizeEntryTaskDefinition.handler
    );

    registeredEngines.add(engine);
  });

  registrationPromises.set(engine, registrationPromise);

  try {
    await registrationPromise;
  } finally {
    registrationPromises.delete(engine);
  }
}

export function resetTaskRegistry(): void {
  registeredEngines = new WeakSet<FlowEngine>();
  registrationPromises = new WeakMap<FlowEngine, Promise<void>>();
}
