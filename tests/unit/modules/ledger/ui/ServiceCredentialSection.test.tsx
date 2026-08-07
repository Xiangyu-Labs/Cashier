import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceCredentialSection } from "@/modules/ledger/ui/ServiceCredentialSection";
import type { CreatedServiceCredentialDto } from "@/modules/ledger/contracts";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("ServiceCredentialSection", () => {
  it("keeps the create dialog locked until the credential is authoritative", async () => {
    let resolveCreate!: (value: CreatedServiceCredentialDto) => void;
    const onCreateCredential = vi.fn(
      () =>
        new Promise<CreatedServiceCredentialDto>((resolve) => {
          resolveCreate = resolve;
        })
    );
    render(
      <ServiceCredentialSection
        credentials={[]}
        onCreateCredential={onCreateCredential}
        onDeleteCredential={vi.fn(async () => undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "newCredential" }));
    fireEvent.change(screen.getByPlaceholderText("namePlaceholder"), {
      target: { value: "Automation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "cancel" })).toBeDisabled());
    expect(screen.getByPlaceholderText("namePlaceholder")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    expect(onCreateCredential).toHaveBeenCalledTimes(1);

    resolveCreate({
      id: "credential-1",
      ledgerId: "ledger-1",
      name: "Automation",
      token: "secret",
      tokenPrefix: "sec",
      tokenSuffix: "ret",
      createdAt: "2026-08-07T00:00:00.000Z",
      lastUsedAt: null,
      deletedAt: null,
    });
    await waitFor(() => expect(screen.getByText("createSuccessTitle")).toBeInTheDocument());
  });

  it("awaits deletion and prevents the confirmation from closing early", async () => {
    let resolveDelete!: () => void;
    const onDeleteCredential = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );
    render(
      <ServiceCredentialSection
        credentials={[
          {
            id: "credential-1",
            ledgerId: "ledger-1",
            name: "Automation",
            tokenPrefix: "sec",
            tokenSuffix: "ret",
            createdAt: "2026-08-07T00:00:00.000Z",
            lastUsedAt: null,
            deletedAt: null,
          },
        ]}
        onCreateCredential={vi.fn()}
        onDeleteCredential={onDeleteCredential}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "deleteTitle" }));
    fireEvent.click(screen.getByRole("button", { name: "delete" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "delete" })).toBeDisabled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onDeleteCredential).toHaveBeenCalledTimes(1);

    resolveDelete();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
