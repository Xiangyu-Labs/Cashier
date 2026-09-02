import type {
  DirectStoredFilePort,
  UploadFileRequestContract,
  UploadPlanContract,
} from "@/application/contracts";
import { StoredFileAuthorizedReadAdapter } from "./stored-files/authorized-file-reads";

export class StoredFileAdapter
  extends StoredFileAuthorizedReadAdapter
  implements DirectStoredFilePort {}

export const storedFileAdapter = new StoredFileAdapter();

export async function createUploadPlanForSubmission(
  ledgerId: string,
  files: readonly UploadFileRequestContract[]
): Promise<UploadPlanContract | null> {
  return files.length === 0 ? null : storedFileAdapter.createUploadPlan(ledgerId, files);
}
