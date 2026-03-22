import { describe, expect, it } from "vitest";
import { DEFAULT_AUTH_EMAIL_FROM, isValidAuthEmailFrom } from "@/lib/utils/email";

describe("isValidAuthEmailFrom", () => {
  it("accepts named mailboxes and bare addresses", () => {
    expect(isValidAuthEmailFrom("Cashier <noreply@example.com>")).toBe(true);
    expect(isValidAuthEmailFrom("noreply@example.com")).toBe(true);
    expect(isValidAuthEmailFrom("My App <no-reply@my.app>")).toBe(true);
  });

  it("rejects multiple addresses and header injection", () => {
    expect(isValidAuthEmailFrom("Cashier <a@example.com>, b@example.com")).toBe(false);
    expect(isValidAuthEmailFrom("Cashier\r\nBcc:evil@example.com")).toBe(false);
    expect(isValidAuthEmailFrom("Cashier\nX-Header: bad")).toBe(false);
  });

  it("rejects empty strings and malformed addresses", () => {
    expect(isValidAuthEmailFrom("")).toBe(false);
    expect(isValidAuthEmailFrom("not-an-email")).toBe(false);
    expect(isValidAuthEmailFrom("Cashier <not-an-email>")).toBe(false);
  });

  it("uses a named mailbox as the default sender", () => {
    expect(DEFAULT_AUTH_EMAIL_FROM).toBe("Cashier <noreply@example.com>");
  });
});
