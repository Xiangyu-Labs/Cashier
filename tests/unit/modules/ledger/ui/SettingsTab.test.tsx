import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiSettings } from "@/modules/ledger/ui/settings/AiSettings";
import { BookkeepingSettings } from "@/modules/ledger/ui/settings/BookkeepingSettings";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/modules/ledger/ui/CurrencySection", () => ({
  CurrencySection: () => <div>currency-section</div>,
}));

vi.mock("@/modules/ledger/ui/CategorySection", () => ({
  CategorySection: () => <div>category-section</div>,
}));

describe("explicit settings section drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps AI changes local until Save and submits only the diff", async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue({
      id: "ledger-1",
      userId: "user-1",
      settings: {
        aiLanguage: "zh-CN",
        duplicateDetectionEnabled: true,
        aiCustomPrompt: "Draft prompt",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    render(
      <AiSettings
        settings={{
          aiLanguage: "zh-CN",
          duplicateDetectionEnabled: true,
          aiCustomPrompt: "Server prompt",
        }}
        onUpdateSettings={onUpdateSettings}
      />
    );

    const prompt = screen.getByRole("textbox", { name: "aiPrompt" });
    fireEvent.change(prompt, { target: { value: "Draft prompt" } });
    fireEvent.blur(prompt);
    expect(onUpdateSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(onUpdateSettings).toHaveBeenCalledWith({ aiCustomPrompt: "Draft prompt" })
    );
  });

  it("restores the AI server snapshot on Cancel", () => {
    render(
      <AiSettings
        settings={{
          aiLanguage: "zh-CN",
          duplicateDetectionEnabled: true,
          aiCustomPrompt: "Server prompt",
        }}
        onUpdateSettings={() =>
          Promise.resolve({
            id: "ledger-1",
            userId: "user-1",
            settings: {},
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          })
        }
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "aiPrompt" }), {
      target: { value: "Discard me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));

    expect(screen.getByRole("textbox", { name: "aiPrompt" })).toHaveValue("Server prompt");
  });

  it("keeps bookkeeping switches as a draft until Save", async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue({
      id: "ledger-1",
      userId: "user-1",
      settings: {
        mainCurrency: "CNY",
        currencies: ["CNY"],
        collapseEntriesDefault: true,
        timeZone: null,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    render(
      <BookkeepingSettings
        settings={{
          mainCurrency: "CNY",
          currencies: ["CNY"],
          collapseEntriesDefault: false,
          timeZone: null,
        }}
        categories={[]}
        uncategorizedCount={0}
        deviceTimeZone="Asia/Shanghai"
        onUpdateSettings={onUpdateSettings}
        onSaveCategories={() => Promise.resolve([])}
        generatingCategoryIds={new Set()}
        failedCategoryIds={new Set()}
        onRetryMetadata={() => {}}
        isSavingCategories={false}
      />
    );

    fireEvent.click(screen.getByRole("switch", { name: "collapseEntries" }));
    expect(onUpdateSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() =>
      expect(onUpdateSettings).toHaveBeenCalledWith({ collapseEntriesDefault: true })
    );
  });
});
