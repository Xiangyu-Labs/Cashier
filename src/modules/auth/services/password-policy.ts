import bcrypt from "bcryptjs";
import { AppError } from "@/lib/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const HAS_LETTER_AND_NUMBER = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AppError(
      "Password must be between 8 and 128 characters",
      AUTH_ERROR_CODES.PASSWORD_TOO_SHORT,
      400
    );
  }
  if (bcrypt.truncates(password)) {
    throw new AppError(
      "Password must be at most 72 UTF-8 bytes",
      AUTH_ERROR_CODES.PASSWORD_REQUIREMENTS_NOT_MET,
      400
    );
  }
  if (!HAS_LETTER_AND_NUMBER.test(password)) {
    throw new AppError(
      "Password must contain at least one letter and one number",
      AUTH_ERROR_CODES.PASSWORD_REQUIREMENTS_NOT_MET,
      400
    );
  }
}
