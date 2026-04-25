import { AppError } from "@/lib/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const PASSWORD_REQUIREMENTS_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      "Password must be at least 8 characters",
      AUTH_ERROR_CODES.PASSWORD_TOO_SHORT,
      400
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new AppError(
      "Password must not exceed 128 characters",
      AUTH_ERROR_CODES.PASSWORD_TOO_SHORT,
      400
    );
  }
  if (!PASSWORD_REQUIREMENTS_REGEX.test(password)) {
    throw new AppError(
      "Password must contain at least one letter and one number",
      AUTH_ERROR_CODES.PASSWORD_REQUIREMENTS_NOT_MET,
      400
    );
  }
}
