import { CredentialsSignin } from "@auth/core/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { runtimeEnv } from "@/lib/env/runtime";
import { logger } from "@/lib/logger";
import { currentApplication } from "@/application/current";
import type { UserAccountPort } from "@/application/contracts";

export class RegistrationDisabledError extends CredentialsSignin {
  code = AUTH_ERROR_CODES.REGISTRATION_DISABLED;
}

export async function isRegistrationAllowed(
  email: string,
  users: UserAccountPort = currentApplication.userAccounts
): Promise<boolean> {
  if (!runtimeEnv.disableRegistration) {
    return true;
  }

  const normalizedEmail = email.toLowerCase();
  return (await users.findByEmail(normalizedEmail)) != null;
}

export async function assertRegistrationAllowed(email: string): Promise<void> {
  if (await isRegistrationAllowed(email)) {
    return;
  }

  logger.warn({ email: email.toLowerCase() }, "Registration disabled for new user sign-in");
  throw new RegistrationDisabledError();
}
