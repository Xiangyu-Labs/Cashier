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
    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
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
        onUpdateSettings={() => Promise.resolve()}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "aiPrompt" }), {
      target: { value: "Discard me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));

    expect(screen.getByRole("textbox", { name: "aiPrompt" })).toHaveValue("Server prompt");
  });

  it("keeps bookkeeping switches as a draft until Save", async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
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
