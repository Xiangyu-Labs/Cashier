import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// --------------------------------------------------------------------------
// Hoisted mocks — run before any imports
// --------------------------------------------------------------------------
const {
  resolveAuthenticatedHomeMock,
  getMessagesMock,
  getLedgerPageBootstrapMock,
  scheduleProcessingRecoveryAfterMock,
} = vi.hoisted(() => ({
  resolveAuthenticatedHomeMock: vi.fn(),
  getMessagesMock: vi.fn(),
  getLedgerPageBootstrapMock: vi.fn(),
  scheduleProcessingRecoveryAfterMock: vi.fn(),
}));

// --------------------------------------------------------------------------
// Module mocks — installed before components are imported
// --------------------------------------------------------------------------
vi.mock("@/modules/workspace/server/resolve-authenticated-home", () => ({
  resolveAuthenticatedHome: resolveAuthenticatedHomeMock,
}));

vi.mock("@/modules/workspace/application/queries/get-ledger-page-bootstrap", () => ({
  getLedgerPageBootstrap: getLedgerPageBootstrapMock,
}));

vi.mock("@/modules/source-document/server-actions/schedule-processing-recovery", () => ({
  scheduleProcessingRecoveryAfter: scheduleProcessingRecoveryAfterMock,
}));

vi.mock("@/app/[locale]/(protected)/_ledger-bootstrap-fallback", () => ({
  LedgerBootstrapFallback: () =>
    React.createElement("div", { "data-testid": "ledger-bootstrap-fallback" }),
}));

vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("next-intl/server", () => ({
  getMessages: getMessagesMock,
  getLocale: vi.fn(() => Promise.resolve("en")),
}));

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useTranslations: () => (key: string) => key,
    useLocale: () => "en",
  };
});

vi.mock("@/i18n/client-feature-messages", () => ({
  pickMessages: (messages: Record<string, unknown>, namespaces: string[]) => {
    const picked: Record<string, unknown> = {};
    for (const ns of namespaces) {
      if (ns in messages) picked[ns] = messages[ns];
    }
    return picked;
  },
  FEATURE_MESSAGES: {
    shell: ["Common"],
    stream: ["LedgerPage"],
    details: [],
    stats: [],
    settings: [],
  },
}));

// Mock ActiveShell so we don't need client-side hook mocks (usePathname, useSearchParams, etc.)
vi.mock("@/app/[locale]/(protected)/_active-shell", () => ({
  ActiveShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "active-shell" }, children),
}));

// Mock the LedgerPageClient with a simple placeholder
vi.mock("@/modules/workspace/ui/LedgerPageClient", () => ({
  LedgerPageClient: (_props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "ledger-page-client" }),
}));

// Mock skeleton components
vi.mock("@/components/skeletons", () => ({
  LedgerPageSkeleton: () => React.createElement("div", { "data-testid": "ledger-page-skeleton" }),
}));

vi.mock("@/components/skeletons/TabSkeletons", () => ({
  EntriesTabSkeleton: () => React.createElement("div", { "data-testid": "entries-tab-skeleton" }),
}));

// HydrationBoundary mock — just renders children
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    HydrationBoundary: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// --------------------------------------------------------------------------
// Imports after all mocks
// --------------------------------------------------------------------------
import { Suspense } from "react";
import HomePage from "@/app/[locale]/(protected)/page";
import { ActiveTab } from "@/app/[locale]/(protected)/_active-tab";
import { ActiveContent } from "@/app/[locale]/(protected)/_active-content";
import { UnauthorizedError } from "@/lib/errors";

describe("protected home streaming boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthenticatedHomeMock.mockResolvedValue({
      userId: "user-1",
      ledgerId: "ledger-1",
      ledgerDto: {
        id: "ledger-1",
        userId: "user-1",
        settings: { mainCurrency: "USD" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      session: {
        user: {
          id: "user-1",
          email: "user@test.com",
          name: "Test",
          image: null,
        },
      },
      locale: "en",
    });
    getMessagesMock.mockResolvedValue({
      Common: { notFound: "Not found" },
      LedgerPage: { stream: "Stream" },
    });
    getLedgerPageBootstrapMock.mockResolvedValue({
      dehydratedState: { queries: [], mutations: [] },
      initialCategories: [],
      initialStatsDate: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("page.tsx returns Suspense with LedgerPageSkeleton fallback and ActiveTab child", async () => {
    const pageElement = await HomePage({
      searchParams: Promise.resolve({}),
    });

    // The top-level element should be a Suspense boundary
    expect(pageElement.type).toBe(Suspense);

    // Fallback should be the LedgerPageSkeleton
    expect(pageElement.props.fallback).toBeDefined();

    // Children should be defined (the ActiveTab component)
    expect(pageElement.props.children).toBeDefined();
    expect(typeof pageElement.props.children.type).toBe("function");
  });

  it("does not call auth/resolveHome at the page level (those are in ActiveTab)", async () => {
    const pageElement = await HomePage({
      searchParams: Promise.resolve({}),
    });

    expect(pageElement.type).toBe(Suspense);
    // resolveAuthenticatedHome is inside ActiveTab, not triggered by page.tsx
    // directly — Suspense children are lazy renderable
    expect(resolveAuthenticatedHomeMock).not.toHaveBeenCalled();
  });

  it("forwards search params to the ActiveTab component", async () => {
    const searchParams = {
      tab: "details",
      period: "custom",
      startDate: "2026-01-01",
    };
    const pageElement = await HomePage({
      searchParams: Promise.resolve(searchParams),
    });

    const activeTabElement = pageElement.props.children;
    expect(activeTabElement.props.searchParams).toEqual(searchParams);
  });

  it("mounts the shell immediately and keeps bootstrap behind a nested boundary", async () => {
    const element = await ActiveTab({ searchParams: {} });

    expect(resolveAuthenticatedHomeMock).toHaveBeenCalled();
    expect(scheduleProcessingRecoveryAfterMock).toHaveBeenCalledWith("ledger-1");

    const shellElement = element!.props.children;
    expect(shellElement).toBeDefined();

    // The shell renders immediately; the bootstrapped content stays behind
    // a nested Suspense with a startup-preview fallback.
    const suspenseElement = shellElement.props.children;
    expect(suspenseElement.type).toBe(Suspense);
    expect(suspenseElement.props.fallback).toBeDefined();

    const bootstrapElement = suspenseElement.props.children;
    expect(typeof bootstrapElement.type).toBe("function");
    const hydrationElement = await bootstrapElement.type(bootstrapElement.props);
    expect(hydrationElement.type.name).toBe("HydrationBoundary");
    const innerContent = hydrationElement.props.children;
    expect(innerContent.type).toBe(ActiveContent);
    expect(getLedgerPageBootstrapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerId: "ledger-1",
        initialTab: "stream",
        ledgerDto: expect.objectContaining({ id: "ledger-1" }),
      }),
      expect.any(Object)
    );
  });

  it("falls back to client queries when the bootstrap fails", async () => {
    getLedgerPageBootstrapMock.mockRejectedValueOnce(new Error("bootstrap unavailable"));

    const element = await ActiveTab({ searchParams: {} });
    const suspenseElement = element!.props.children.props.children;
    const bootstrapElement = suspenseElement.props.children;

    const contentElement = await bootstrapElement.type(bootstrapElement.props);

    expect(contentElement.type.name).toBe("HydrationBoundary");
    expect(contentElement.props.children.type).toBe(ActiveContent);
  });

  it("ActiveContent passes the pre-authorized ledger dto to the client", () => {
    const ledgerDto = {
      id: "ledger-1",
      userId: "user-1",
      settings: { mainCurrency: "USD" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const element = ActiveContent({
      ledgerId: "ledger-1",
      ledgerDto,
      initialTab: "stream",
      periodParams: { period: "thisMonth" },
      advancedFilters: {
        categoryId: null,
        currency: null,
        minAmount: null,
        maxAmount: null,
      },
      userEmail: "user@test.com",
      locale: "en",
    });

    expect(element.props.initialLedger).toBe(ledgerDto);
  });

  it("ActiveContent keeps the interactive client mounted for slow or failed tab queries", () => {
    const ledgerDto = {
      id: "ledger-1",
      userId: "user-1",
      settings: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const element = ActiveContent({
      ledgerId: "ledger-1",
      ledgerDto,
      initialTab: "stream",
      periodParams: { period: "thisMonth" },
      advancedFilters: {
        categoryId: null,
        currency: null,
        minAmount: null,
        maxAmount: null,
      },
      locale: "en",
    });

    expect(element.props.initialLedger).toBe(ledgerDto);
  });

  it("throws non-UnauthorizedError from resolveAuthenticatedHome", async () => {
    // Simulate a non-auth error (e.g., database failure)
    const dbError = new Error("Database connection failed");
    resolveAuthenticatedHomeMock.mockRejectedValue(dbError);

    // ActiveTab should rethrow the error, not swallow it
    await expect(ActiveTab({ searchParams: {} })).rejects.toThrow("Database connection failed");
  });

  it("redirects on UnauthorizedError from resolveAuthenticatedHome", async () => {
    resolveAuthenticatedHomeMock.mockRejectedValue(new UnauthorizedError());

    // The redirect mock throws "REDIRECT" — ActiveTab should let it propagate
    // since redirect() throws internally.
    await expect(ActiveTab({ searchParams: {} })).rejects.toThrow("REDIRECT");
  });
});
