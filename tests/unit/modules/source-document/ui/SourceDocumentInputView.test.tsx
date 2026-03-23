import { createRef, type ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SourceDocumentInputView } from "@/modules/source-document/ui/SourceDocumentInputView";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: ComponentProps<"img">) => <img {...props} />,
}));

vi.mock("@/modules/source-document/ui/SourceDocumentImageModal", () => ({
  SourceDocumentImageModal: ({
    open,
  }: {
    open: boolean;
  }) => <div data-testid="source-document-image-modal" data-open={open ? "true" : "false"} />,
}));

vi.mock("@/components/ui/date-filter", () => ({
  DateFilter: ({
    placeholder,
    onChange,
  }: {
    placeholder?: string;
    onChange: (date: Date | null) => void;
  }) => (
    <button type="button" data-testid="date-filter" onClick={() => onChange(null)}>
      {placeholder ?? "date-filter"}
    </button>
  ),
}));

function createProps(
  overrides: Partial<ComponentProps<typeof SourceDocumentInputView>> = {}
): ComponentProps<typeof SourceDocumentInputView> {
  return {
    mode: "create",
    text: "",
    entryDate: new Date("2026-03-20T00:00:00.000Z"),
    images: [],
    selectedImageIndex: null,
    fileInputRef: createRef<HTMLInputElement>(),
    isPending: false,
    canSubmit: false,
    messages: {
      placeholder: "Describe the document",
      image: "Image",
      send: "Send",
      retry: "Retry",
      delete: "Delete",
      sendingStatus: "Sending...",
      entryDate: "Date (optional)",
    },
    onEntryDateChange: vi.fn(),
    onTextChange: vi.fn(),
    onTextareaPaste: vi.fn(),
    onFileInputChange: vi.fn(),
    onSelectImages: vi.fn(),
    onSubmit: vi.fn(),
    onRemoveImage: vi.fn(),
    onImageOpen: vi.fn(),
    onImageClose: vi.fn(),
    onImageModalSave: vi.fn(),
    ...overrides,
  };
}

describe("SourceDocumentInputView", () => {
  it("does not render the image grid when there are no images", () => {
    render(<SourceDocumentInputView {...createProps()} />);

    expect(screen.queryByAltText("Uploaded 1")).toBeNull();
  });

  it("shows the pending button label while submitting", () => {
    render(
      <SourceDocumentInputView
        {...createProps({
          text: "Receipt",
          isPending: true,
          canSubmit: true,
        })}
      />
    );

    expect(screen.getByRole("button", { name: "Sending..." })).toHaveProperty("disabled", true);
  });

  it("switches the primary action label in retry mode", () => {
    render(
      <SourceDocumentInputView
        {...createProps({
          mode: "retry",
          text: "Retry this document",
          canSubmit: true,
        })}
      />
    );

    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("falls back to the current date when the date filter is cleared", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T09:00:00.000Z"));
    const onEntryDateChange = vi.fn();

    render(<SourceDocumentInputView {...createProps({ onEntryDateChange })} />);

    screen.getByTestId("date-filter").click();

    expect(onEntryDateChange).toHaveBeenCalledWith(new Date("2026-03-23T09:00:00.000Z"));
    vi.useRealTimers();
  });
});
