import { CredentialsSignin } from "@auth/core/errors";
import { and, eq, isNull } from "drizzle-orm";
import type { User } from "next-auth";
import { db } from "@/lib/db";
import { users } from "@/persistence/schema/auth";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { verifyPassword } from "@/modules/auth/services/password";
import { logger } from "@/lib/logger";
import { normalizeEmail } from "@/lib/utils/email";

const MAX_EMAIL_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class PasswordCredentialsSigninError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

export class InvalidCredentialsSignInError extends PasswordCredentialsSigninError {
  constructor() {
    super(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
  }
}

function validateCredentials(email: string, password: string): string {
  if (email === "" || email.length > MAX_EMAIL_LENGTH) {
    throw new InvalidCredentialsSignInError();
  }

  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new InvalidCredentialsSignInError();
  }

  if (password === "") {
    throw new InvalidCredentialsSignInError();
  }

  return normalizedEmail;
}

export async function authenticateWithPassword(params: {
  email: string;
  password: string;
}): Promise<User> {
  const normalizedEmail = validateCredentials(params.email, params.password);

  const user = await db.query.users.findFirst({
    where: and(eq(users.email, normalizedEmail), isNull(users.deletedAt)),
  });

  if (user == null) {
    logger.warn({ email: normalizedEmail }, "Password sign-in failed: user not found");
    throw new InvalidCredentialsSignInError();
  }

  if (user.passwordHash == null) {
    logger.warn({ email: normalizedEmail }, "Password sign-in failed: no password set");
    throw new InvalidCredentialsSignInError();
  }

  const isValid = await verifyPassword(params.password, user.passwordHash);
  if (!isValid) {
    logger.warn({ email: normalizedEmail }, "Password sign-in failed: incorrect password");
    throw new InvalidCredentialsSignInError();
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
  };
}
