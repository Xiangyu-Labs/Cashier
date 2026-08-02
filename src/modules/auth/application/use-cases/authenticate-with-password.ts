import { CredentialsSignin } from "@auth/core/errors";
import type { User } from "next-auth";
import type { UserAccountPort } from "@/application/contracts";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { verifyPassword } from "@/modules/auth/services/password";
import { normalizeEmail } from "@/lib/utils/email";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";

class InvalidCredentialsSignInError extends CredentialsSignin {
  code = AUTH_ERROR_CODES.INVALID_CREDENTIALS;
}

export async function authenticateWithPassword(
  params: { email: string; password: string },
  users: UserAccountPort
): Promise<User> {
  const email = normalizeEmail(params.email);
  const user = email === "" ? null : await users.findByEmail(email);
  const valid =
    user?.passwordHash != null && (await verifyPassword(params.password, user.passwordHash));

  if (user == null || !valid) {
    logger.warn({ subject: logIdentifier("email", email) }, "Password sign-in failed");
    throw new InvalidCredentialsSignInError();
  }

  return { id: user.id, email: user.email, name: user.name, image: user.image };
}
