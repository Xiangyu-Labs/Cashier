import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminAccountsInput } from "@/modules/admin/contract-schemas";
import type {
  AdminAccountListItem,
  ListAdminAccountsInput,
  ListAdminAccountsResult,
} from "@/modules/admin/contracts";
import { accounts, users } from "@/persistence";

export async function listAdminAccounts(
  input: ListAdminAccountsInput = {}
): Promise<ListAdminAccountsResult> {
  await requireSuperAdmin();

  const validated = parseListAdminAccountsInput(input);
  const conditions: (ReturnType<typeof eq> | ReturnType<typeof isNull>)[] = [];

  if (validated.provider != null) {
    conditions.push(eq(accounts.provider, validated.provider));
  }

  const rows = await db
    .select({
      userId: accounts.userId,
      provider: accounts.provider,
      providerAccountId: accounts.providerAccountId,
      type: accounts.type,
      refreshToken: accounts.refresh_token,
      accessToken: accounts.access_token,
      expiresAt: accounts.expires_at,
      tokenType: accounts.token_type,
      scope: accounts.scope,
      idToken: accounts.id_token,
      sessionState: accounts.session_state,
      userEmail: users.email,
    })
    .from(accounts)
    .leftJoin(users, and(eq(accounts.userId, users.id), isNull(users.deletedAt)))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(accounts.provider), asc(accounts.providerAccountId));

  const availableProviderRows = await db
    .selectDistinct({ provider: accounts.provider })
    .from(accounts)
    .orderBy(asc(accounts.provider));

  const items: AdminAccountListItem[] = rows.map((row) => ({
    userId: row.userId,
    userEmail: row.userEmail,
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    type: row.type,
  }));

  return {
    items,
    availableProviders: availableProviderRows.map((row) => row.provider),
    hasAnyAccounts: items.length > 0,
  };
}
