import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { Providers } from "@/components/providers";

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("Providers", () => {
  it("renders children without query persistence", () => {
    render(
      React.createElement(
        Providers,
        null,
        React.createElement("div", null, "child-content")
      )
    );

    expect(screen.getByText("child-content")).toBeTruthy();
  });
});
