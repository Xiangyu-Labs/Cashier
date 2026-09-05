import type { TestProject } from "vitest/node";
import { prepareTestPostgres } from "../scripts/prepare-test-postgres.mjs";

export interface CashierPostgresContext {
  databaseUrl: string;
  runId: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    cashierPostgres: CashierPostgresContext;
  }
}

export default async function setup(project: TestProject) {
  const resource = await prepareTestPostgres();
  try {
    project.provide("cashierPostgres", {
      databaseUrl: resource.databaseUrl,
      runId: resource.runId,
    });
  } catch (error) {
    await resource.cleanup();
    throw error;
  }

  return async () => {
    await resource.cleanup();
  };
}
