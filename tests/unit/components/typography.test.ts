import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
import { textRoleClassName } from "@/components/typography";

describe("cn", () => {
  // tailwind-merge reads an unregistered `text-<size>` as a colour and drops it
  // when a colour follows, so `--text-micro` has to be registered explicitly.
  it("keeps the custom text-micro size when a colour follows", () => {
    expect(cn("text-micro", "text-muted-foreground")).toBe("text-micro text-muted-foreground");
  });
});

describe("textRoleClassName", () => {
  it("appends caller classes after the role", () => {
    expect(textRoleClassName("meta", "truncate")).toBe("text-xs text-muted-foreground truncate");
  });

  it("lets the caller override the role size", () => {
    const className = textRoleClassName("meta", "text-sm");
    expect(className).toContain("text-sm");
    expect(className).not.toContain("text-xs");
    expect(className).toContain("text-muted-foreground");
  });
});
