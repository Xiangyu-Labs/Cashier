import type { User } from "next-auth";
import type { LedgerPort, UserAccountPort } from "@/application/contracts";
import { resolveSingleLedgerForUser } from "@/modules/workspace/application/use-cases/ensure-user-ledger";
import { DEV_AUTH_EMAIL, DEV_AUTH_NAME, isDevAuthBypassEnabled } from "@/modules/auth/dev-auth";

export async function authenticateDevUser(
  params: { locale?: string },
  dependencies: { users: UserAccountPort; ledgers: LedgerPort }
): Promise<User | null> {
  if (!isDevAuthBypassEnabled()) return null;
  const locale = params.locale ?? "zh-CN";
  const { user } = await dependencies.users.findOrCreate(DEV_AUTH_EMAIL, DEV_AUTH_NAME);
  await resolveSingleLedgerForUser({ userId: user.id, locale }, dependencies.ledgers);
  return { ...user, locale };
}
