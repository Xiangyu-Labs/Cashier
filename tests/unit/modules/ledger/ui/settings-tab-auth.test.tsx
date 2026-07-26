import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Ledger } from "@/modules/ledger/contracts";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
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

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

vi.mock("@/components/ui/pull-to-refresh", () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/modules/ledger/hooks", () => ({
  useLedgerSettings: () => ({
    ledger: null,
    categories: [],
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

vi.mock("@/modules/ledger/ui/CollapsibleSection", () => ({
  CollapsibleSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

import { SettingsTab } from "@/modules/ledger/ui/SettingsTab";

describe("SettingsTab account authentication controls", () => {
  it("renders email and sign-out, but not retired account mutations", () => {
    const ledger = {
      id: "ledger-1",
      userId: "user-1",
      metadata: { settings: {} },
    } as unknown as Ledger;

    render(
      <SettingsTab
        ledger={ledger}
        initialCategories={[]}
        ledgerId="ledger-1"
        userEmail="person@example.com"
      />
    );

    // Required: email and sign-out command
    expect(screen.getAllByText("person@example.com").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /sign out|退出登录/i })).toBeInTheDocument();

    // Retired commands must be absent
    expect(
      screen.queryByRole("button", { name: /change email|修改邮箱/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear data|清空数据/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete account|删除账户/i })
    ).not.toBeInTheDocument();
  });
});
