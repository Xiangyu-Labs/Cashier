export { listAdminUsers } from "./application/queries/list-admin-users";
export { listAdminTasks } from "./application/queries/list-admin-tasks";
export { getAdminTaskDetail } from "./application/queries/get-admin-task-detail";
import type {
  AdminEntryDetail,
  AdminSourceDocumentDetail,
  ListAdminEntriesInput,
  ListAdminEntriesResult,
  ListAdminSourceDocumentsInput,
  ListAdminSourceDocumentsResult,
} from "./contracts";

export async function listAdminSourceDocuments(
  _input: ListAdminSourceDocumentsInput = {}
): Promise<ListAdminSourceDocumentsResult> {
  throw new Error("listAdminSourceDocuments is not implemented yet");
}

export async function getAdminSourceDocumentDetail(_input: unknown): Promise<AdminSourceDocumentDetail> {
  throw new Error("getAdminSourceDocumentDetail is not implemented yet");
}

export async function listAdminEntries(
  _input: ListAdminEntriesInput = {}
): Promise<ListAdminEntriesResult> {
  throw new Error("listAdminEntries is not implemented yet");
}

export async function getAdminEntryDetail(_input: unknown): Promise<AdminEntryDetail> {
  throw new Error("getAdminEntryDetail is not implemented yet");
}
