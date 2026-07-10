import type { TaskRuntime, TaskHandler } from "./types";

let registeredEngines = new WeakSet<TaskRuntime>();
let registrationPromises = new WeakMap<TaskRuntime, Promise<void>>();

function registerTaskIfNeeded(
  engine: TaskRuntime,
  name: string,
  handler: TaskHandler<unknown, unknown>
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
 * Register all task handlers with the task runtime.
 * Safe to call multiple times for the same engine.
 */
export async function registerAllTasks(engine: TaskRuntime): Promise<void> {
  if (registeredEngines.has(engine)) {
    return;
  }

  const existingPromise = registrationPromises.get(engine);
  if (existingPromise != null) {
    await existingPromise;
    return;
  }

  const registrationPromise = Promise.resolve().then(async () => {
    if (registeredEngines.has(engine)) {
      return;
    }

    const { parseSourceDocumentTaskDefinition } = await import(
      "@/modules/source-document/tasks"
    );

    registerTaskIfNeeded(
      engine,
      parseSourceDocumentTaskDefinition.type,
      parseSourceDocumentTaskDefinition.handler
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
  registeredEngines = new WeakSet<TaskRuntime>();
  registrationPromises = new WeakMap<TaskRuntime, Promise<void>>();
}
