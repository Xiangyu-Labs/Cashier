import { AUTH_ERROR_CODES, AuthSignInError } from "@/modules/auth/errors";
import { runtimeEnv } from "@/lib/env/runtime";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import type { UserAccountPort } from "@/application/contracts";

export class RegistrationDisabledError extends AuthSignInError {
  constructor() {
    super(AUTH_ERROR_CODES.REGISTRATION_DISABLED);
  }
}

export async function isRegistrationAllowed(
  email: string,
  users: UserAccountPort
): Promise<boolean> {
  if (!runtimeEnv.disableRegistration) {
    return true;
  }

  const normalizedEmail = email.toLowerCase();
  return (await users.findByEmail(normalizedEmail)) != null;
}

export async function assertRegistrationAllowed(
  email: string,
  users: UserAccountPort
): Promise<void> {
  if (await isRegistrationAllowed(email, users)) {
    return;
  }

  logger.warn(
    { subject: logIdentifier("email", email) },
    "Registration disabled for new user sign-in"
  );
  throw new RegistrationDisabledError();
}
