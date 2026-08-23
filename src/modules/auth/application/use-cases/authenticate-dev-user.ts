import type { UserAccountPort } from "@/application/contracts";
import { DEV_AUTH_EMAIL, DEV_AUTH_NAME, isDevAuthBypassEnabled } from "@/modules/auth/dev-auth";
import type { AuthenticatedPrincipal } from "@/modules/auth/contracts";

export async function authenticateDevUser(
  params: { locale?: string },
  dependencies: { users: UserAccountPort }
): Promise<AuthenticatedPrincipal | null> {
  if (!isDevAuthBypassEnabled()) return null;
  const locale = params.locale ?? "zh-CN";
  const { user, isExistingUser } = await dependencies.users.findOrCreate(
    DEV_AUTH_EMAIL,
    DEV_AUTH_NAME
  );
  return { ...user, locale, isNewUser: !isExistingUser };
}
