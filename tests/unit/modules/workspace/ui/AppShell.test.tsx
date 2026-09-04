import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/modules/workspace/ui/AppShell";

describe("AppShell", () => {
  it("renders one responsive navigation landmark", () => {
    render(
      <AppShell navigation={<nav aria-label="Ledger navigation">Navigation</nav>}>Content</AppShell>
    );

    expect(screen.getAllByRole("navigation")).toHaveLength(1);
  });
});
