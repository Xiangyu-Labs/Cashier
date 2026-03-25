import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminTaskJsonBlock } from "@/modules/admin/ui/AdminTaskJsonBlock";

describe("AdminTaskJsonBlock", () => {
  it("renders undefined as not available", () => {
    render(<AdminTaskJsonBlock label="Input" value={undefined} notAvailableLabel="—" />);

    expect(screen.getByText("Input")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders null and empty JSON-like states explicitly", () => {
    const { rerender } = render(
      <AdminTaskJsonBlock label="Input" value={null} notAvailableLabel="—" />
    );
    expect(screen.getByText("null")).toBeTruthy();

    rerender(<AdminTaskJsonBlock label="Input" value="" notAvailableLabel="—" />);
    expect(screen.getByText('""')).toBeTruthy();

    rerender(<AdminTaskJsonBlock label="Input" value={{}} notAvailableLabel="—" />);
    expect(screen.getByText("{}")).toBeTruthy();

    rerender(<AdminTaskJsonBlock label="Input" value={[]} notAvailableLabel="—" />);
    expect(screen.getByText("[]")).toBeTruthy();
  });

  it("pretty-prints structured JSON and keeps literal non-JSON strings", () => {
    const { rerender } = render(
      <AdminTaskJsonBlock
        label="Input"
        value={{ sourceDocumentId: "doc-1", nested: { count: 1 } }}
        notAvailableLabel="—"
      />
    );

    const pretty = screen.getByText((_, element) => element?.tagName === 'PRE' && (element.textContent ?? '').includes('\"sourceDocumentId\": \"doc-1\"'));
    expect(pretty).toBeTruthy();

    rerender(
      <AdminTaskJsonBlock label="Input" value="raw-token-usage:input=1" notAvailableLabel="—" />
    );
    expect(screen.getByText("raw-token-usage:input=1")).toBeTruthy();
  });

  it("uses safe overflow container and selectable preformatted content", () => {
    render(
      <AdminTaskJsonBlock
        label="Input"
        value={{ message: "very long content" }}
        notAvailableLabel="—"
      />
    );

    const pre = screen
      .getByText((_, element) => element?.tagName === 'PRE' && (element.textContent ?? '').includes('very long content'))
      .closest("pre");
    expect(pre).toBeTruthy();
    expect(pre?.className).toContain("select-text");
    expect(pre?.className).toContain("whitespace-pre-wrap");

    const container = pre?.parentElement;
    expect(container?.className).toContain("overflow-x-auto");
    expect(container?.className).toContain("max-h-");
  });
});
