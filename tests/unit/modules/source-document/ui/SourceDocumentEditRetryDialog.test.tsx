import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { getSourceDocumentFullActionMock, sourceDocumentInputMock, useQueryMock } = vi.hoisted(
  () => ({
    getSourceDocumentFullActionMock: vi.fn(),
    sourceDocumentInputMock: vi.fn(),
    useQueryMock: vi.fn(),
  })
);

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children?: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/modules/source-document/actions", () => ({
  getSourceDocumentFullAction: getSourceDocumentFullActionMock,
}));

vi.mock("@/modules/source-document/ui/SourceDocumentInput", () => ({
  SourceDocumentInput: (props: Record<string, unknown>) => {
    sourceDocumentInputMock(props);
    return <div data-testid="source-document-input" />;
  },
}));

import { SourceDocumentEditRetryDialog } from "@/modules/source-document/ui/SourceDocumentEditRetryDialog";

describe("SourceDocumentEditRetryDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation(
      ({ enabled, queryFn }: { enabled?: boolean; queryFn?: () => Promise<unknown> }) => {
        if (enabled === true && queryFn != null) {
          queryFn().catch(() => undefined);
        }

        return {
          data: null,
          isLoading: false,
        };
      }
    );
  });

  it("does not fetch full retry data when the light DTO already contains text and imageUrls", () => {
    render(
      <SourceDocumentEditRetryDialog
        ledgerId="ledger-1"
        open
        onOpenChange={vi.fn()}
        sourceDocument={{
          id: "doc-1",
          text: "Receipt text",
          imageUrls: ["/api/uploads/ledger-1/doc-1/a.jpg"],
          hasImages: true,
          entryDate: "2026-03-20",
        }}
      />
    );

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      })
    );
    expect(getSourceDocumentFullActionMock).not.toHaveBeenCalled();
    expect(sourceDocumentInputMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDocumentId: "doc-1",
        initialData: {
          images: [{ data: "/api/uploads/ledger-1/doc-1/a.jpg", mimeType: "image/jpeg" }],
          text: "Receipt text",
          entryDate: "2026-03-20",
        },
      })
    );
  });
});
