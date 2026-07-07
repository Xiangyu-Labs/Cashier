import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsTab } from "@/modules/ledger/ui/SettingsTab";
import type { Ledger } from "@/modules/ledger/contracts";

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

vi.mock("@/modules/auth/ui", () => ({
  ChangeEmailForm: () => <button type="button">Change email</button>,
  ClearDataForm: () => <button type="button">Clear data</button>,
  DeleteAccountForm: () => <button type="button">Delete account</button>,
}));

vi.mock("@/modules/ledger/ui/CurrencySection", () => ({
  CurrencySection: () => <div>Currency section</div>,
}));

vi.mock("@/modules/ledger/ui/CategorySection", () => ({
  CategorySection: () => <div>Category section</div>,
}));

vi.mock("@/modules/ledger/ui/ServiceCredentialSection", () => ({
  ServiceCredentialSection: () => <div>Service credentials</div>,
}));

vi.mock("@/modules/ledger/ui/ExportSection", () => ({
  ExportSection: () => <div>Export data</div>,
}));

vi.mock("@/modules/ledger/hooks", () => ({
  useLedgerSettings: ({ ledger, initialCategories }: { ledger: Ledger; initialCategories: unknown[] }) => ({
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
  useAutoCategorizeMutation: () => ({ mutateAsync: vi.fn() }),
}));

const ledger: Ledger = {
  id: "ledger-1",
  userId: "user-1",
  metadata: {
    settings: {
      mainCurrency: "CNY",
      currencies: ["CNY"],
      aiLanguage: "zh-CN",
    },
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

describe("SettingsTab layout", () => {
  it("renders workflow sections in the agreed order", () => {
    render(<SettingsTab ledger={ledger} ledgerId="ledger-1" initialCategories={[]} />);

    const sectionHeadings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);

    expect(sectionHeadings).toEqual([
      "外观与语言",
      "记账规则",
      "AI 解析",
      "自动化",
      "账号与数据",
    ]);
  });

  it("labels service credentials as automation", () => {
    render(<SettingsTab ledger={ledger} ledgerId="ledger-1" initialCategories={[]} />);

    expect(screen.getByRole("heading", { name: "自动化" })).toBeInTheDocument();
    expect(screen.queryByText("账本设置")).not.toBeInTheDocument();
  });
});
