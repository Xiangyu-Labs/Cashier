import type { DirectStoredFilePort } from "@/application/contracts";
import { createAuthorizedFileReadOperations } from "./stored-files/authorized-file-reads";
import {
  resolveStoredFileAdapterDependencies,
  type StoredFileAdapterDependencies,
} from "./stored-files/shared";

export type StoredFileAdapter = DirectStoredFilePort &
  ReturnType<typeof createAuthorizedFileReadOperations>;

export function createStoredFileAdapter(
  dependencies: StoredFileAdapterDependencies = {}
): StoredFileAdapter {
  return createAuthorizedFileReadOperations(
    resolveStoredFileAdapterDependencies(dependencies)
  ) as StoredFileAdapter;
}

export const storedFileAdapter = createStoredFileAdapter();
