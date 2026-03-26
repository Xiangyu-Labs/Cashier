export { listAdminUsers } from "./application/queries/list-admin-users";
export { listAdminTasks } from "./application/queries/list-admin-tasks";
export { getAdminTaskDetail } from "./application/queries/get-admin-task-detail";
export { listAdminSourceDocuments } from "./application/queries/list-admin-source-documents";
export { getAdminSourceDocumentDetail } from "./application/queries/get-admin-source-document-detail";

export async function listAdminEntries(_input: unknown) {
  throw new Error("listAdminEntries is not implemented yet");
}

export async function getAdminEntryDetail(_input: unknown) {
  throw new Error("getAdminEntryDetail is not implemented yet");
}
