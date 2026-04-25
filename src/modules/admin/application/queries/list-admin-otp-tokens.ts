import type { ListAdminOTPTokensInput, ListAdminOTPTokensResult } from "@/modules/admin/contracts";

export async function listAdminOTPTokens(_input?: ListAdminOTPTokensInput): Promise<ListAdminOTPTokensResult> {
  return { items: [], nextCursor: null, hasAnyOTPTokens: false };
}
