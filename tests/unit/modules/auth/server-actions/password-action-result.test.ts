import { describe, expect, it } from "vitest";
import { AppError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { toPasswordMutationActionErrorCode } from "@/modules/auth/server-actions/password-action-result";

describe("toPasswordMutationActionErrorCode", () => {
  it.each([
    AUTH_ERROR_CODES.PASSWORD_TOO_SHORT,
    AUTH_ERROR_CODES.PASSWORD_REQUIREMENTS_NOT_MET,
    AUTH_ERROR_CODES.PASSWORD_MISMATCH,
    AUTH_ERROR_CODES.CURRENT_PASSWORD_WRONG,
  ] as const)("preserves the stable auth code %s", (code) => {
    expect(toPasswordMutationActionErrorCode(new AppError("safe", code))).toBe(code);
  });

  it("maps validation errors", () => {
    expect(toPasswordMutationActionErrorCode(new ValidationError("invalid"))).toBe(
      "validation_failed"
    );
  });

  it.each([new ConflictError("changed"), new NotFoundError("User")])(
    "maps conflict-like errors",
    (error) => {
      expect(toPasswordMutationActionErrorCode(error)).toBe("conflict");
    }
  );

  it.each([new Error("raw"), "raw", null])("maps unknown errors to unexpected", (error) => {
    expect(toPasswordMutationActionErrorCode(error)).toBe("unexpected");
  });
});
