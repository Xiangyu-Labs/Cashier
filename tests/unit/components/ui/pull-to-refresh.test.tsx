import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("PullToRefresh", () => {
  beforeEach(() => {
    Object.defineProperty(window, "ontouchstart", { configurable: true, value: null });
  });

  it("renders its indicator before the header and page content", async () => {
    render(
      <PullToRefresh
        onRefresh={async () => {}}
        header={<header data-testid="toolbar">Toolbar</header>}
      >
        <main data-testid="content">Content</main>
      </PullToRefresh>
    );

    await waitFor(() =>
      expect(screen.getByTestId("pull-to-refresh-indicator")).toBeInTheDocument()
    );
    const indicator = screen.getByTestId("pull-to-refresh-indicator");
    const toolbar = screen.getByTestId("toolbar");
    const content = screen.getByTestId("content");

    expect(
      indicator.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      toolbar.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
