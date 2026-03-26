import type React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { UserRole } from "@/modules/admin/types";
import type { AdminTaskDetail, AdminTaskListItem, AdminUserListItem } from "@/modules/admin/contracts";

const {
  requireSuperAdminMock,
  listAdminUsersMock,
  listAdminTasksMock,
  getAdminTaskDetailMock,
  listAdminSourceDocumentsMock,
  getAdminSourceDocumentDetailMock,
  listAdminEntriesMock,
  getAdminEntryDetailMock,
  redirectMock,
} = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
  listAdminUsersMock: vi.fn(),
  listAdminTasksMock: vi.fn(),
  getAdminTaskDetailMock: vi.fn(),
  listAdminSourceDocumentsMock: vi.fn(),
  getAdminSourceDocumentDetailMock: vi.fn(),
  listAdminEntriesMock: vi.fn(),
  getAdminEntryDetailMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

vi.mock("@/modules/admin/queries", () => ({
  listAdminUsers: listAdminUsersMock,
  listAdminTasks: listAdminTasksMock,
  getAdminTaskDetail: getAdminTaskDetailMock,
  listAdminSourceDocuments: listAdminSourceDocumentsMock,
  getAdminSourceDocumentDetail: getAdminSourceDocumentDetailMock,
  listAdminEntries: listAdminEntriesMock,
  getAdminEntryDetail: getAdminEntryDetailMock,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespaceArg: { namespace: string } | string) => {
    const keyspace = typeof namespaceArg === "string" ? namespaceArg : namespaceArg.namespace;
    return (key: string) => `${keyspace}.${key}`;
  },
  getLocale: async () => "en",
}));

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  usePathname: () => "/en/admin/users",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  redirect: redirectMock,
}));

describe("admin route composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the unauthorized state when the admin gate throws ForbiddenError", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new ForbiddenError("Forbidden"));
    const Layout = (await import("@/app/[locale]/(protected)/admin/layout")).default;

    render(await Layout({ children: <div>secret</div> }));

    expect(screen.getByText("AdminUnauthorized.title")).toBeTruthy();
  });

  it("renders the expanded admin nav when the super-admin gate passes", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    const Layout = (await import("@/app/[locale]/(protected)/admin/layout")).default;

    render(await Layout({ children: <div>secret</div> }));

    expect(screen.getByRole("link", { name: "Admin.overview" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Admin.users" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Admin.sourceDocuments" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Admin.entries" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Admin.tasks" })).toBeTruthy();
  });

  it("redirects to login when the session user no longer resolves in the database", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(
      new UnauthorizedError("User not found in database")
    );
    const Layout = (await import("@/app/[locale]/(protected)/admin/layout")).default;

    const result = await Layout({ children: <div>secret</div> });

    expect(result).toBeNull();
    expect(redirectMock).toHaveBeenCalledWith("/api/auth/signout?callbackUrl=%2Fen%2Flogin");
  });

  it("exports source-document and entry list-input parsers with stable defaults", async () => {
    const {
      parseListAdminSourceDocumentsInput,
      parseListAdminEntriesInput,
    } = await import("@/modules/admin/contract-schemas");

    expect(parseListAdminSourceDocumentsInput({})).toEqual({
      range: "all",
      result: "all",
      limit: 50,
    });
    expect(parseListAdminEntriesInput({})).toEqual({
      range: "all",
      sourceLink: "all",
      limit: 50,
    });
  });

  it("wires the users page to the admin query and list component", async () => {
    const users: AdminUserListItem[] = [
      {
        id: "admin-user",
        email: "admin@example.com",
        name: "Owner",
        emailVerified: new Date("2026-03-22T10:00:00.000Z"),
        image: "https://example.com/avatar.png",
        role: UserRole.SuperAdmin,
        createdAt: new Date("2026-03-21T10:00:00.000Z"),
        updatedAt: new Date("2026-03-23T10:00:00.000Z"),
        deletedAt: null,
      },
    ];
    listAdminUsersMock.mockResolvedValueOnce(users);

    const UsersPage = (await import("@/app/[locale]/(protected)/admin/users/page")).default;
    render(await UsersPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("admin@example.com")).toBeTruthy();
  });

  it("wires the tasks page to the admin query with normalized search params", async () => {
    const items: AdminTaskListItem[] = [
      {
        id: "task-1",
        status: "failed",
        type: "parse_source_document",
        title: "Parse source document",
        progress: null,
        error: "AI returned invalid JSON",
        scopeId: "ledger-1",
        scopeUserEmail: "owner@example.com",
        entityType: "source_document",
        entityId: "doc-1",
        createdAt: new Date("2026-03-22T10:00:00.000Z"),
        startedAt: new Date("2026-03-22T10:01:00.000Z"),
        completedAt: null,
      },
    ];

    listAdminTasksMock.mockResolvedValueOnce({
      items,
      nextCursor: null,
      availableTypes: ["parse_source_document"],
      hasAnyTasks: true,
    });

    const TasksPage = (await import("@/app/[locale]/(protected)/admin/tasks/page")).default;
    render(
      await TasksPage({
        searchParams: Promise.resolve({
          status: ["failed"],
          type: "parse_source_document",
          range: ["7d"],
          cursor: "2026-03-20T00:00:00.000Z|task-9",
          limit: ["25"],
        }),
      })
    );

    expect(listAdminTasksMock).toHaveBeenCalledWith({
      status: "failed",
      type: "parse_source_document",
      range: "7d",
      cursor: "2026-03-20T00:00:00.000Z|task-9",
      limit: "25",
    });
    expect(screen.getAllByText("parse_source_document").length).toBeGreaterThan(0);
    expect(screen.getByText("owner@example.com")).toBeTruthy();
  });

  it("loads full detail only when detail search param is present", async () => {
    const items: AdminTaskListItem[] = [
      {
        id: "task-1",
        status: "failed",
        type: "parse_source_document",
        title: "Parse source document",
        progress: null,
        error: "AI returned invalid JSON",
        scopeId: "ledger-1",
        scopeUserEmail: "owner@example.com",
        entityType: "source_document",
        entityId: "doc-1",
        createdAt: new Date("2026-03-22T10:00:00.000Z"),
        startedAt: new Date("2026-03-22T10:01:00.000Z"),
        completedAt: null,
      },
    ];

    const detail: AdminTaskDetail = {
      id: "task-1",
      status: "failed",
      type: "parse_source_document",
      title: "Parse source document",
      input: { sourceDocumentId: "doc-1" },
      deduplicationKey: "parse:doc-1",
      scopeId: "ledger-1",
      scopeUserEmail: "owner@example.com",
      entityType: "source_document",
      entityId: "doc-1",
      error: "AI returned invalid JSON",
      progress: "25%",
      tokenUsage: { total: { input: 10, output: 20 } },
      createdAt: new Date("2026-03-22T10:00:00.000Z"),
      updatedAt: new Date("2026-03-22T10:02:00.000Z"),
      startedAt: new Date("2026-03-22T10:01:00.000Z"),
      completedAt: new Date("2026-03-22T10:03:00.000Z"),
      deletedAt: null,
    };

    listAdminTasksMock.mockResolvedValue({
      items,
      nextCursor: null,
      availableTypes: ["parse_source_document"],
      hasAnyTasks: true,
    });
    getAdminTaskDetailMock.mockResolvedValue(detail);

    const TasksPage = (await import("@/app/[locale]/(protected)/admin/tasks/page")).default;

    render(
      await TasksPage({
        searchParams: Promise.resolve({ detail: "task-1", status: "failed" }),
      })
    );

    expect(listAdminTasksMock).toHaveBeenCalledWith({
      status: "failed",
      type: undefined,
      range: undefined,
      cursor: undefined,
      limit: undefined,
    });
    expect(getAdminTaskDetailMock).toHaveBeenCalledWith("task-1");
    expect(screen.getByText("AdminTasks.taskId")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "AdminTasks.rawData" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AdminTasks.showRawData" })).toBeTruthy();

    vi.clearAllMocks();
    listAdminTasksMock.mockResolvedValue({
      items,
      nextCursor: null,
      availableTypes: ["parse_source_document"],
      hasAnyTasks: true,
    });

    render(
      await TasksPage({
        searchParams: Promise.resolve({ status: "failed" }),
      })
    );

    expect(getAdminTaskDetailMock).not.toHaveBeenCalled();
  });

  it("wires the source-documents page to the admin query with normalized search params", async () => {
    listAdminSourceDocumentsMock.mockResolvedValueOnce({
      items: [
        {
          id: "doc-1",
          ledgerId: "ledger-1",
          userEmail: "owner@example.com",
          title: "March lunch receipt",
          status: "completed",
          type: "ai_parsed",
          entryDate: "2026-03-20",
          entryCount: 2,
          anomalyReason: null,
          createdAt: new Date("2026-03-22T10:00:00.000Z"),
          updatedAt: new Date("2026-03-22T10:02:00.000Z"),
        },
      ],
      nextCursor: null,
      availableTypes: ["ai_parsed"],
      hasAnySourceDocuments: true,
    });

    const SourceDocumentsPage = (
      await import("@/app/[locale]/(protected)/admin/source-documents/page")
    ).default;

    render(
      await SourceDocumentsPage({
        searchParams: Promise.resolve({
          status: ["completed"],
          type: "ai_parsed",
          range: ["7d"],
          result: ["withEntries"],
          cursor: "2026-03-20T00:00:00.000Z|doc-9",
          limit: ["25"],
        }),
      })
    );

    expect(listAdminSourceDocumentsMock).toHaveBeenCalledWith({
      status: "completed",
      type: "ai_parsed",
      range: "7d",
      result: "withEntries",
      cursor: "2026-03-20T00:00:00.000Z|doc-9",
      limit: "25",
    });
    expect(screen.getAllByText("AdminSourceDocuments.status").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "AdminSourceDocuments.title" })).toBeTruthy();
    expect(screen.getAllByText("March lunch receipt").length).toBeGreaterThan(0);
    expect(screen.getByText("owner@example.com")).toBeTruthy();
  });

  it("loads source-document detail only when detail search param is present", async () => {
    listAdminSourceDocumentsMock.mockResolvedValue({
      items: [
        {
          id: "doc-1",
          ledgerId: "ledger-1",
          userEmail: "owner@example.com",
          title: "March lunch receipt",
          status: "completed",
          type: "ai_parsed",
          entryDate: "2026-03-20",
          entryCount: 2,
          anomalyReason: null,
          createdAt: new Date("2026-03-22T10:00:00.000Z"),
          updatedAt: new Date("2026-03-22T10:02:00.000Z"),
        },
      ],
      nextCursor: null,
      availableTypes: ["ai_parsed"],
      hasAnySourceDocuments: true,
    });
    getAdminSourceDocumentDetailMock.mockResolvedValue({
      id: "doc-1",
      ledgerId: "ledger-1",
      userEmail: "owner@example.com",
      title: "March lunch receipt",
      text: "Lunch total 18.50",
      imageUrls: ["https://example.com/receipt.png"],
      status: "completed",
      type: "ai_parsed",
      anomalyReason: null,
      entryDate: "2026-03-20",
      metadata: { provider: "openai" },
      entryCount: 2,
      createdAt: new Date("2026-03-22T10:00:00.000Z"),
      updatedAt: new Date("2026-03-22T10:02:00.000Z"),
      deletedAt: null,
    });

    const SourceDocumentsPage = (
      await import("@/app/[locale]/(protected)/admin/source-documents/page")
    ).default;

    render(
      await SourceDocumentsPage({
        searchParams: Promise.resolve({ detail: "doc-1", status: "completed" }),
      })
    );

    expect(getAdminSourceDocumentDetailMock).toHaveBeenCalledWith("doc-1");
    expect(screen.getByText("AdminSourceDocuments.sourceDocumentId")).toBeTruthy();

    vi.clearAllMocks();
    listAdminSourceDocumentsMock.mockResolvedValue({
      items: [],
      nextCursor: null,
      availableTypes: [],
      hasAnySourceDocuments: false,
    });

    render(
      await SourceDocumentsPage({
        searchParams: Promise.resolve({ status: "completed" }),
      })
    );

    expect(getAdminSourceDocumentDetailMock).not.toHaveBeenCalled();
  });

  it("wires the entries page to the admin query with normalized search params", async () => {
    listAdminEntriesMock.mockResolvedValueOnce({
      items: [
        {
          id: "entry-1",
          ledgerId: "ledger-1",
          userEmail: "owner@example.com",
          categoryId: "category-1",
          categoryName: "Meals",
          sourceDocumentId: "doc-1",
          amount: "18.50",
          currency: "USD",
          itemName: "Lunch",
          createdAt: new Date("2026-03-22T10:00:00.000Z"),
        },
      ],
      nextCursor: null,
      availableCurrencies: ["USD"],
      availableCategories: [{ id: "category-1", name: "Meals" }],
      hasAnyEntries: true,
    });

    const EntriesPage = (await import("@/app/[locale]/(protected)/admin/entries/page")).default;

    render(
      await EntriesPage({
        searchParams: Promise.resolve({
          range: ["30d"],
          currency: ["USD"],
          categoryId: "category-1",
          sourceLink: ["linked"],
          cursor: "2026-03-20T00:00:00.000Z|entry-9",
          limit: ["25"],
        }),
      })
    );

    expect(listAdminEntriesMock).toHaveBeenCalledWith({
      range: "30d",
      currency: "USD",
      categoryId: "category-1",
      sourceLink: "linked",
      cursor: "2026-03-20T00:00:00.000Z|entry-9",
      limit: "25",
    });
    expect(screen.getAllByText("AdminEntries.range").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "AdminEntries.title" })).toBeTruthy();
    expect(screen.getAllByText("Lunch").length).toBeGreaterThan(0);
    expect(screen.getByText("owner@example.com")).toBeTruthy();
  });

  it("loads entry detail only when detail search param is present", async () => {
    listAdminEntriesMock.mockResolvedValue({
      items: [
        {
          id: "entry-1",
          ledgerId: "ledger-1",
          userEmail: "owner@example.com",
          categoryId: "category-1",
          categoryName: "Meals",
          sourceDocumentId: "doc-1",
          amount: "18.50",
          currency: "USD",
          itemName: "Lunch",
          createdAt: new Date("2026-03-22T10:00:00.000Z"),
        },
      ],
      nextCursor: null,
      availableCurrencies: ["USD"],
      availableCategories: [{ id: "category-1", name: "Meals" }],
      hasAnyEntries: true,
    });
    getAdminEntryDetailMock.mockResolvedValue({
      id: "entry-1",
      ledgerId: "ledger-1",
      userEmail: "owner@example.com",
      categoryId: "category-1",
      categoryName: "Meals",
      sourceDocumentId: "doc-1",
      amount: "18.50",
      currency: "USD",
      itemName: "Lunch",
      description: "Team meal",
      convertedAmount: null,
      exchangeRate: null,
      createdAt: new Date("2026-03-22T10:00:00.000Z"),
      updatedAt: new Date("2026-03-22T10:02:00.000Z"),
      deletedAt: null,
    });

    const EntriesPage = (await import("@/app/[locale]/(protected)/admin/entries/page")).default;

    render(
      await EntriesPage({
        searchParams: Promise.resolve({ detail: "entry-1", currency: "USD" }),
      })
    );

    expect(getAdminEntryDetailMock).toHaveBeenCalledWith("entry-1");
    expect(screen.getByText("AdminEntries.entryId")).toBeTruthy();

    vi.clearAllMocks();
    listAdminEntriesMock.mockResolvedValue({
      items: [],
      nextCursor: null,
      availableCurrencies: [],
      availableCategories: [],
      hasAnyEntries: false,
    });

    render(
      await EntriesPage({
        searchParams: Promise.resolve({ currency: "USD" }),
      })
    );

    expect(getAdminEntryDetailMock).not.toHaveBeenCalled();
  });

  it("keeps no-data and filtered-empty rendering through page wiring", async () => {
    listAdminTasksMock.mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      availableTypes: [],
      hasAnyTasks: false,
    });

    const TasksPage = (await import("@/app/[locale]/(protected)/admin/tasks/page")).default;
    render(await TasksPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "AdminTasks.emptyTitle" })).toBeTruthy();
    expect(screen.getByText("AdminTasks.emptyDescription")).toBeTruthy();

    listAdminTasksMock.mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      availableTypes: ["parse_source_document"],
      hasAnyTasks: true,
    });

    render(await TasksPage({ searchParams: Promise.resolve({ status: "failed" }) }));

    expect(screen.getByRole("heading", { name: "AdminTasks.filteredEmptyTitle" })).toBeTruthy();
    expect(screen.getByText("AdminTasks.filteredEmptyDescription")).toBeTruthy();
  });

  it("bubbles task query errors for admin error boundary handling", async () => {
    const expectedError = new Error("db exploded");
    listAdminTasksMock.mockRejectedValueOnce(expectedError);

    const TasksPage = (await import("@/app/[locale]/(protected)/admin/tasks/page")).default;

    await expect(TasksPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(expectedError);
  });

  it("bubbles detail query errors for admin error boundary handling", async () => {
    listAdminTasksMock.mockResolvedValueOnce({
      items: [
        {
          id: "task-1",
          status: "failed",
          type: "parse_source_document",
          title: "Parse source document",
          progress: null,
          error: "AI returned invalid JSON",
          scopeId: "ledger-1",
          scopeUserEmail: "owner@example.com",
          entityType: "source_document",
          entityId: "doc-1",
          createdAt: new Date("2026-03-22T10:00:00.000Z"),
          startedAt: new Date("2026-03-22T10:01:00.000Z"),
          completedAt: null,
        },
      ],
      nextCursor: null,
      availableTypes: ["parse_source_document"],
      hasAnyTasks: true,
    });
    getAdminTaskDetailMock.mockRejectedValueOnce(new Error("detail exploded"));

    const TasksPage = (await import("@/app/[locale]/(protected)/admin/tasks/page")).default;

    await expect(
      TasksPage({ searchParams: Promise.resolve({ status: "failed", detail: "task-1" }) })
    ).rejects.toThrow("detail exploded");
  });
});
