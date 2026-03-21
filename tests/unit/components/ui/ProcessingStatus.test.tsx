import { render, screen } from "@testing-library/react";
import { ProcessingStatus } from "../../../../src/modules/source-document/ui/processing-status";
import { describe, it, expect } from "vitest";

describe("ProcessingStatus", () => {
  it("renders queued status correctly", () => {
    render(<ProcessingStatus status="queued" />);
    expect(screen.getByTestId("status-label")).toBeTruthy();
  });

  it("renders processing status correctly", () => {
    render(<ProcessingStatus status="processing" />);
    expect(screen.getByTestId("status-label")).toBeTruthy();
  });

  it("renders completed status correctly", () => {
    const { container } = render(<ProcessingStatus status="completed" />);
    // When component returns null, the container (div) should be empty
    expect(container.firstChild).toBeNull();
  });

  it("renders error status correctly", () => {
    render(<ProcessingStatus status="error" />);
    expect(screen.getByTestId("status-label")).toBeTruthy();
  });

  it("applies custom className", () => {
    const { container } = render(<ProcessingStatus status="queued" className="custom-class" />);
    // Check if the class is present in the class list
    expect(container.firstChild).toBeTruthy();
    const className = (container.firstChild as HTMLElement).className;
    expect(className).toContain("custom-class");
  });
});
