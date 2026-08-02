import { isRegistrationAllowed } from "./registration-policy";
import type { UserAccountPort } from "@/application/contracts";

export async function isAuthSignInAllowed(
  params: { email?: string | null },
  users: UserAccountPort
): Promise<boolean> {
  if (params.email == null || params.email === "") {
    return true;
  }

  return isRegistrationAllowed(params.email, users);
}
