import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsTab } from "@/modules/ledger/ui/SettingsTab";
import type { Ledger } from "@/modules/ledger/contracts";
import { PullToRefreshProvider } from "@/modules/workspace/pull-to-refresh-context";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "me@example.com" } } }),
  signOut: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ledger/ledger-1/settings",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/ui/pull-to-refresh", () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/modules/ledger/ui/CurrencySection", () => ({
  CurrencySection: () => <div>Currency section</div>,
}));

vi.mock("@/modules/ledger/ui/CategorySection", () => ({
  CategorySection: () => <div>Category section</div>,
}));

vi.mock("@/modules/ledger/ui/ServiceCredentialSection", () => ({
  ServiceCredentialSection: () => (
    <div>
      <h3>API 密钥</h3>
      <div>Service credentials</div>
    </div>
  ),
}));

vi.mock("@/modules/ledger/ui/ExportSection", () => ({
  ExportSection: () => <div>Export data</div>,
}));

vi.mock("@/modules/ledger/hooks", () => ({
  useLedgerSettings: ({
    ledger,
    initialCategories,
  }: {
    ledger: Ledger;
    initialCategories: unknown[];
  }) => ({
    ledger,
    categories: initialCategories,
    uncategorizedCount: 0,
    credentials: [],
    updateLedgerMutation: { mutate: vi.fn() },
    isPending: false,
  }),
  useCategoryMutations: () => ({
    createCategory: { mutate: vi.fn() },
    updateCategory: { mutate: vi.fn() },
    deleteCategory: { mutate: vi.fn() },
    reorderCategories: { mutate: vi.fn() },
    categoryCreatedTrigger: 0,
  }),
  useCredentialMutations: () => ({
    createCredential: { mutateAsync: vi.fn() },
    deleteCredential: { mutate: vi.fn() },
  }),
}));

const ledger: Ledger = {
  id: "ledger-1",
  userId: "user-1",
  settings: {
    mainCurrency: "CNY",
    currencies: ["CNY"],
    aiLanguage: "zh-CN",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("SettingsTab layout", () => {
  const renderSettings = () =>
    render(
      <PullToRefreshProvider>
        <SettingsTab ledger={ledger} ledgerId="ledger-1" initialCategories={[]} />
      </PullToRefreshProvider>
    );

  it("renders workflow sections in the agreed order", () => {
    renderSettings();

    const sectionHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .map((node) => node.textContent);

    expect(sectionHeadings).toEqual(["外观与语言", "记账规则", "AI 解析", "账户"]);
  });

  it("puts API keys in the account section and removes automation", () => {
    renderSettings();

    const apiKeyHeading = screen.getByRole("heading", { name: "API 密钥" });
    expect(apiKeyHeading.closest("section")).toHaveTextContent("账户");
    expect(screen.queryByRole("heading", { name: "自动化" })).not.toBeInTheDocument();
  });

  it("uses the theme select, detected automatic time zone, and stacked prompt", async () => {
    const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    renderSettings();

    expect(screen.getByRole("combobox", { name: "主题" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "默认折叠记录" })).not.toBeChecked();
    const timeZoneField = screen.getByRole("heading", { name: "账本时区" }).parentElement
      ?.parentElement;
    await waitFor(() =>
      expect(timeZoneField?.querySelector("[data-slot='select-trigger']")).toHaveTextContent(
        `自动（${detectedTimeZone}）`
      )
    );
    expect(screen.getByRole("combobox", { name: "界面语言" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "AI 输出语言" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "使 AI 生成的标题、项目名、补差项和备注符合该语言母语者的记账表达，不限制票据原文语言"
      )
    ).toBeInTheDocument();
    const prompt = screen.getByRole("textbox", { name: "账本提示词" });
    expect(prompt).toHaveClass("w-full", "resize-y");
    expect(prompt.parentElement).toHaveClass("w-full");
  });
});
