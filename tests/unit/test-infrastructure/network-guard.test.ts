import { describe, expect, it } from "vitest";
import { createUnexpectedHttpError, takeUnexpectedHttpErrors } from "../../setup.network";

describe("test network guard", () => {
  it("blocks unhandled HTTP and reports only the method and origin", async () => {
    const response = await fetch("https://example.com/private/path?token=secret");

    const [error] = takeUnexpectedHttpErrors();
    expect(response.status).toBe(500);
    expect(error?.message).toBe("TEST_UNEXPECTED_HTTP GET https://example.com");
    expect(error?.message).not.toContain("password");
    expect(error?.message).not.toContain("private");
    expect(error?.message).not.toContain("secret");
  });

  it("formats malformed request metadata without echoing the URL", () => {
    expect(createUnexpectedHttpError({ method: "post", url: "not a url" }).message).toBe(
      "TEST_UNEXPECTED_HTTP POST invalid-origin"
    );
    expect(
      createUnexpectedHttpError({
        method: "get",
        url: "https://user:password@example.com/private?token=secret",
      }).message
    ).toBe("TEST_UNEXPECTED_HTTP GET https://example.com");
  });
});
