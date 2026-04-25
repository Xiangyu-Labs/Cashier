import type { ListAdminAccountsInput, ListAdminAccountsResult } from "@/modules/admin/contracts";

export async function listAdminAccounts(_input?: ListAdminAccountsInput): Promise<ListAdminAccountsResult> {
  return { items: [], availableProviders: [], hasAnyAccounts: false };
}
