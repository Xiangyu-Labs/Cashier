import { describe, it, expect } from "vitest";
import { UnauthorizedError, NotFoundError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode } from "@/lib/error-handlers";

describe("errors", () => {
  describe("toErrorResponse", () => {
    it("should convert AppError to response", () => {
      const error = new NotFoundError("User");
      const response = toErrorResponse(error);

      expect(response.error.code).toBe("NOT_FOUND");
      expect(response.error.message).toBe("User not found");
    });

    it("omits diagnostics for client-safe errors", () => {
      const response = toErrorResponse(new UnauthorizedError());

      expect(Object.hasOwn(response.error, "details")).toBe(false);
    });

    it("sanitizes generic Error", () => {
      const error = new Error("Something broke at /private/path");
      const response = toErrorResponse(error);

      expect(response.error.code).toBe("INTERNAL");
      expect(response.error.message).not.toContain("/private");
      expect(response.error.details).toEqual({ correlationId: expect.any(String) });
    });
  });

  describe("getErrorStatusCode", () => {
    it("should return AppError status code", () => {
      const error = new UnauthorizedError();
      expect(getErrorStatusCode(error)).toBe(401);
    });

    it("should return 500 for unknown errors", () => {
      expect(getErrorStatusCode(new Error("test"))).toBe(500);
      expect(getErrorStatusCode("string error")).toBe(500);
    });
  });
});
