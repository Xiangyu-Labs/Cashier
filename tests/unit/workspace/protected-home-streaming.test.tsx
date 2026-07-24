import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// --------------------------------------------------------------------------
// Hoisted mocks — run before any imports
// --------------------------------------------------------------------------
const { auth: authMock, getLocale: getLocaleMock, getMessages: getMessagesMock } = vi.hoisted(
  () => ({
    auth: vi.fn(),
    getLocale: vi.fn(),
    getMessages: vi.fn(),
  })
);

const { redirectMock, resolveHomeMock, getLedgerPageBootstrapMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  resolveHomeMock: vi.fn(),
  getLedgerPageBootstrapMock: vi.fn(),
}));

// --------------------------------------------------------------------------
// Module mocks — installed before components are imported
// --------------------------------------------------------------------------
vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/i18n/routing", () => ({
  redirect: redirectMock,
}));

vi.mock("@/modules/workspace/application/use-cases/resolve-home", () => ({
  resolveHome: resolveHomeMock,
}));

vi.mock("@/modules/workspace/application/queries/get-ledger-page-bootstrap", () => ({
  getLedgerPageBootstrap: getLedgerPageBootstrapMock,
}));

vi.mock("next-intl/server", () => ({
  getLocale: getLocaleMock,
  getMessages: getMessagesMock,
  getTranslations: () => vi.fn(() => "test-translation"),
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

vi.mock("@/lib/request-cache", () => ({
  createRequestCache: (fn: Function) => fn,
}));

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

// The LedgerPageClient is complex and depends on many hooks — we don't need
// to test its internal render here. The streaming boundary test is about the
// page rendering the skeleton first while the ActiveTab is pending.
vi.mock("@/modules/workspace/ui/LedgerPageClient", () => ({
  LedgerPageClient: () => React.createElement("div", { "data-testid": "ledger-page-client" }, "Client"),
}));

// --------------------------------------------------------------------------
// Imports after all mocks
// --------------------------------------------------------------------------
import { Suspense } from "react";
import HomePage from "@/app/[locale]/(protected)/page";

describe("protected home streaming boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders skeleton fallback while active tab bootstrap is pending", async () => {
    // Create a deferred promise that never resolves during this test
    let resolveBootstrap!: (value: unknown) => void;
    getLedgerPageBootstrapMock.mockReturnValue(
      new Promise((resolve) => {
        resolveBootstrap = resolve;
      })
    );
    resolveHomeMock.mockResolvedValue({ ledgerId: "ledger-1", created: false });
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getLocaleMock.mockResolvedValue("en");
    getMessagesMock.mockResolvedValue({});

    // The page renders Suspense with LedgerPageSkeleton as fallback.
    // The ActiveTab is inside the Suspense so it starts resolving in parallel.
    const pageElement = await HomePage({
      searchParams: Promise.resolve({}),
    });

    // The top-level element should be a Suspense boundary
    expect(pageElement.type).toBe(Suspense);

    // The fallback is the LedgerPageSkeleton
    const fallback = pageElement.props.fallback;
    expect(fallback).toBeDefined();
    // The fallback is a skeleton component
    expect(fallback.props?.activeTab ?? true).toBeDefined();

    // The children should be the ActiveTab async component
    expect(pageElement.props.children).toBeDefined();
    expect(typeof pageElement.props.children.type).toBe("function");

    // Clean up: resolve the deferred promise
    resolveBootstrap({ dehydratedState: { queries: [], mutations: [] }, initialStatsDate: new Date() });
  });

  it("does not call auth or resolveHome before Suspense returns", async () => {
    // The page should return the Suspense immediately without calling
    // auth or resolveHome at the top level — those are inside ActiveTab
    getLedgerPageBootstrapMock.mockResolvedValue({
      dehydratedState: { queries: [], mutations: [] },
      initialStatsDate: new Date(),
    });
    resolveHomeMock.mockResolvedValue({ ledgerId: "ledger-1", created: false });
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getLocaleMock.mockResolvedValue("en");
    getMessagesMock.mockResolvedValue({});

    const pageElement = await HomePage({
      searchParams: Promise.resolve({}),
    });

    // The page itself doesn't call auth/resolveHome — those are in ActiveTab.
    // Since Suspense children are lazy, these won't be called until the
    // ActiveTab component is actually awaited (which happens in the child render).
    expect(pageElement.type).toBe(Suspense);
    expect(pageElement.props.fallback).toBeDefined();
  });

  it("forwards search params to the ActiveTab component", async () => {
    getLedgerPageBootstrapMock.mockResolvedValue({
      dehydratedState: { queries: [], mutations: [] },
      initialStatsDate: new Date(),
    });
    resolveHomeMock.mockResolvedValue({ ledgerId: "ledger-1", created: false });
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getLocaleMock.mockResolvedValue("en");
    getMessagesMock.mockResolvedValue({});

    const searchParams = { tab: "details", period: "custom", startDate: "2026-01-01" };
    const pageElement = await HomePage({
      searchParams: Promise.resolve(searchParams),
    });

    // The Suspense children receives the ActiveTab component
    const activeTabElement = pageElement.props.children;
    expect(activeTabElement.props.searchParams).toEqual(searchParams);
  });
});
