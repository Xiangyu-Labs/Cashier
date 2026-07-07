import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Ledger } from "@/modules/ledger/contracts";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({
    data: {
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        image: null,
        hasPassword: true,
      },
    },
  }),
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
  useAutoCategorizeMutation: () => ({ mutateAsync: vi.fn() }),
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

vi.mock("@/modules/auth/ui", () => ({
  ChangeEmailForm: () => <button type="button">Change email</button>,
  PasswordForm: () => <button type="button">Change Password</button>,
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

vi.mock("@/modules/ledger/ui/CollapsibleSection", () => ({
  CollapsibleSection: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

import { SettingsTab } from "@/modules/ledger/ui/SettingsTab";

describe("SettingsTab account authentication controls", () => {
  it("does not render password management in email-only auth", () => {
    const ledger = {
      id: "ledger-1",
      userId: "user-1",
      metadata: { settings: {} },
    } as unknown as Ledger;

    render(<SettingsTab ledger={ledger} initialCategories={[]} ledgerId="ledger-1" />);

    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change email" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change Password" })).not.toBeInTheDocument();
    expect(screen.queryByText("密码")).not.toBeInTheDocument();
  });
});
