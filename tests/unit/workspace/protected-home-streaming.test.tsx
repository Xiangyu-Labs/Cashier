import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// --------------------------------------------------------------------------
// Hoisted mocks — run before any imports
// --------------------------------------------------------------------------
const {
  resolveAuthenticatedHomeMock,
  getMessagesMock,
  getLedgerPageBootstrapMock,
  getTranslationsMock,
} = vi.hoisted(() => ({
  resolveAuthenticatedHomeMock: vi.fn(),
  getMessagesMock: vi.fn(),
  getLedgerPageBootstrapMock: vi.fn(),
  getTranslationsMock: vi.fn(),
}));

// --------------------------------------------------------------------------
// Module mocks — installed before components are imported
// --------------------------------------------------------------------------
vi.mock("@/lib/request-cache", () => ({
  resolveAuthenticatedHome: resolveAuthenticatedHomeMock,
}));

vi.mock("@/modules/workspace/application/queries/get-ledger-page-bootstrap", () => ({
  getLedgerPageBootstrap: getLedgerPageBootstrapMock,
}));

vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("next-intl/server", () => ({
  getMessages: getMessagesMock,
  getTranslations: getTranslationsMock,
  getLocale: vi.fn(() => Promise.resolve("en")),
}));

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useTranslations: () => (key: string) => key,
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

describe("protected home streaming boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthenticatedHomeMock.mockResolvedValue({
      userId: "user-1",
      ledgerId: "ledger-1",
      ledgerDto: {
        id: "ledger-1",
        userId: "user-1",
        metadata: { settings: { mainCurrency: "USD" } },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
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
    getTranslationsMock.mockResolvedValue(vi.fn((key: string) => key));
  });

  it("page.tsx returns Suspense with LedgerPageSkeleton fallback and ActiveTab child", async () => {
    const pageElement = await HomePage({
      searchParams: Promise.resolve({}),
    });

    // The top-level element should be a Suspense boundary
    expect(pageElement.type).toBe(Suspense);

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

  it("ActiveTab calls resolveAuthenticatedHome and renders shell with inner Suspense", async () => {
    getLedgerPageBootstrapMock.mockResolvedValue({
      dehydratedState: { queries: [], mutations: [] },
      initialStatsDate: new Date(),
    });

    // ActiveTab awaits resolveAuthenticatedHome before returning JSX.
    // The returned element is wrapped in the mocked NextIntlClientProvider
    // (which renders as Fragment), so element.props.children is the
    // shell div with bg-bg className and the inner Suspense.
    const element = await ActiveTab({ searchParams: {} });

    // resolveAuthenticatedHome should have been called
    expect(resolveAuthenticatedHomeMock).toHaveBeenCalled();

    // The element is a Fragment (mocked NextIntlClientProvider).
    // Its child is the shell div with bg-bg class.
    const shellDiv = element.props.children;
    expect(shellDiv.type).toBe("div");
    expect(shellDiv.props.className).toContain("bg-bg");

    // Inside the shell div, we have a main > Suspense(fallback=EntriesTabSkeleton)
    const mainElement = shellDiv.props.children;
    expect(mainElement.type).toBe("main");

    const innerSuspense = mainElement.props.children;
    expect(innerSuspense.type).toBe(Suspense);
  });

  it("ActiveContent calls getLedgerPageBootstrap with ledgerDto and renders client", async () => {
    getLedgerPageBootstrapMock.mockResolvedValue({
      dehydratedState: { queries: [], mutations: [] },
      initialStatsDate: new Date(),
    });

    // Render ActiveContent directly (not through Suspense) to prove
    // the bootstrap call uses the pre-authorized ledgerDto.
    const element = await ActiveContent({
      ledgerId: "ledger-1",
      ledgerDto: {
        id: "ledger-1",
        userId: "user-1",
        metadata: { settings: { mainCurrency: "USD" } },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
      },
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

    // getLedgerPageBootstrap should have been called with the ledgerDto
    expect(getLedgerPageBootstrapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerId: "ledger-1",
        ledgerDto: expect.objectContaining({ id: "ledger-1" }),
      })
    );

    // The result should contain the LedgerPageClient (wrapped in HydrationBoundary)
    expect(element).toBeDefined();
  });

  it("ActiveContent renders localized notFound message on null bootstrap", async () => {
    getLedgerPageBootstrapMock.mockResolvedValue(null);
    getTranslationsMock.mockResolvedValue(vi.fn((key: string) => key));

    const element = await ActiveContent({
      ledgerId: "ledger-1",
      ledgerDto: {
        id: "ledger-1",
        userId: "user-1",
        metadata: { settings: {} },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
      },
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

    // Should render the localized notFound message, not hardcoded English
    expect(getTranslationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "LedgerPage" })
    );
    expect(element).toBeDefined();
    // The element should be a not-found message div
    expect(element.type).toBe("div");
  });
});
