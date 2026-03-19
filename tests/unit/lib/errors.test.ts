import { describe, it, expect } from "vitest";
import { AppError, ValidationError, UnauthorizedError, NotFoundError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode } from "@/lib/error-handlers";

describe("errors", () => {
  describe("AppError", () => {
    it("should create error with all properties", () => {
      const error = new AppError("Test error", "TEST_CODE", 400, { field: "value" });

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: "value" });
    });
  });

  describe("ValidationError", () => {
    it("should have correct defaults", () => {
      const error = new ValidationError("Invalid input");

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("toErrorResponse", () => {
    it("should convert AppError to response", () => {
      const error = new NotFoundError("User");
      const response = toErrorResponse(error);

      expect(response.error.code).toBe("NOT_FOUND");
      expect(response.error.message).toBe("User not found");
    });

    it("omits details when AppError has no details payload", () => {
      const response = toErrorResponse(new UnauthorizedError());

      expect(Object.hasOwn(response.error, "details")).toBe(false);
    });

    it("should convert generic Error", () => {
      const error = new Error("Something broke");
      const response = toErrorResponse(error);

      expect(response.error.code).toBe("INTERNAL_ERROR");
      expect(response.error.message).toBe("Something broke");
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
