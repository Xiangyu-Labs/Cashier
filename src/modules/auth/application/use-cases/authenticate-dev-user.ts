import type { User } from "next-auth";
import type { UserAccountPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import { resolveSingleLedgerForUser } from "@/modules/workspace/application/use-cases/ensure-user-ledger";
import { DEV_AUTH_EMAIL, DEV_AUTH_NAME, isDevAuthBypassEnabled } from "@/modules/auth/dev-auth";

export async function authenticateDevUser(
  params: { locale?: string },
  users: UserAccountPort = currentApplication.userAccounts
): Promise<User | null> {
  if (!isDevAuthBypassEnabled()) return null;
  const locale = params.locale ?? "zh-CN";
  const { user } = await users.findOrCreate(DEV_AUTH_EMAIL, DEV_AUTH_NAME);
  await resolveSingleLedgerForUser({ userId: user.id, locale });
  return { ...user, locale };
}
