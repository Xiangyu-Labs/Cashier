import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSubmitPayload } from "@/modules/source-document/hooks/source-document-input-controller.core";

describe("buildSubmitPayload local business date", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("submits the browser-local date and IANA timezone explicitly", () => {
    const realIntl = Intl;
    vi.stubGlobal("Intl", {
      ...realIntl,
      DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: "Asia/Shanghai" }) }),
    });

    expect(buildSubmitPayload("receipt", [], new Date(2026, 6, 27, 0, 30))).toMatchObject({
      text: "receipt",
      entryDate: "2026-07-27",
      timezone: "Asia/Shanghai",
    });
  });
});
