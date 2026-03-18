import { CredentialsSignin } from "@auth/core/errors";
import { eq } from "drizzle-orm";
import { AUTH_ERROR_CODES } from "@/features/auth/error-codes";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";
import { logger } from "@/lib/logger";

export class RegistrationDisabledError extends CredentialsSignin {
  code = AUTH_ERROR_CODES.REGISTRATION_DISABLED;
}

export async function isRegistrationAllowed(email: string): Promise<boolean> {
  if (process.env.DISABLE_REGISTRATION !== "true") {
    return true;
  }

  const normalizedEmail = email.toLowerCase();
  const user = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
  });

  return user != null;
}

export async function assertRegistrationAllowed(email: string): Promise<void> {
  if (await isRegistrationAllowed(email)) {
    return;
  }

  logger.warn({ email: email.toLowerCase() }, "Registration disabled for new user sign-in");
  throw new RegistrationDisabledError();
}
