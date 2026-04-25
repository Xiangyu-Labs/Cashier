import type { ListAdminServiceCredentialsInput, ListAdminServiceCredentialsResult } from "@/modules/admin/contracts";

export async function listAdminServiceCredentials(_input?: ListAdminServiceCredentialsInput): Promise<ListAdminServiceCredentialsResult> {
  return { items: [], nextCursor: null, hasAnyServiceCredentials: false };
}
