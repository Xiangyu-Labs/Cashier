
import { render, screen } from "@testing-library/react";
import { TransactionStatus } from "@/components/ui/TransactionStatus";
import { describe, it, expect } from "vitest";

describe("TransactionStatus", () => {
    it("renders queued status correctly", () => {
        render(<TransactionStatus status="queued" />);
        expect(screen.getByText("处理中")).toBeTruthy();
    });

    it("renders processing status correctly", () => {
        render(<TransactionStatus status="processing" />);
        expect(screen.getByText("处理中")).toBeTruthy();
        // Check for spinner icon wrapper or class if possible, but text is good enough for now
    });

    it("renders completed status correctly", () => {
        const { container } = render(<TransactionStatus status="completed" />);
        // When component returns null, the container (div) should be empty
        expect(container.firstChild).toBeNull();
    });

    it("renders failed status correctly", () => {
        render(<TransactionStatus status="failed" />);
        expect(screen.getByText("处理失败")).toBeTruthy();
    });

    it("applies custom className", () => {
        const { container } = render(<TransactionStatus status="queued" className="custom-class" />);
        // Check if the class is present in the class list
        expect(container.firstChild).toBeTruthy();
        const className = (container.firstChild as HTMLElement).className;
        expect(className).toContain("custom-class");
    });
});
