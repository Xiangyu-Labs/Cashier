import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAdminSystemConfig } from "@/modules/admin/queries";

const { requireSuperAdminMock, envCatalogMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
  envCatalogMock: [
    {
      name: "DATABASE_URL",
      tier: "system",
      required: false,
      defaultValue: "file:./data/sqlite.db",
      description: "SQLite database connection string.",
      validateOnStartup: true,
    },
    {
      name: "AI_MODEL_TEXT",
      tier: "runtime",
      required: false,
      defaultValue: "gpt-4o-mini",
      description: "Default text model.",
      validateOnStartup: true,
    },
    {
      name: "AUTH_SECRET",
      tier: "system",
      required: true,
      defaultValue: null,
      description: "Auth secret.",
      validateOnStartup: true,
    },
    {
      name: "NEXT_PUBLIC_APP_URL",
      tier: "frontend",
      required: false,
      defaultValue: "http://localhost:3000",
      description: "Public app URL.",
      validateOnStartup: true,
    },
  ],
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

vi.mock("@/lib/env/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env/catalog")>();

  return {
    ...actual,
    APP_ENV_CATALOG: envCatalogMock,
  };
});

describe("listAdminSystemConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires super-admin access before listing config", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));

    await expect(listAdminSystemConfig()).rejects.toThrow("forbidden");
    expect(requireSuperAdminMock).toHaveBeenCalledOnce();
  });

  it("returns only system and runtime rows in catalog order", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      role: "super_admin",
    });

    const result = await listAdminSystemConfig({} as NodeJS.ProcessEnv);

    expect(result.map((item) => item.name)).toEqual([
      "DATABASE_URL",
      "AI_MODEL_TEXT",
      "AUTH_SECRET",
    ]);
    expect(result.map((item) => item.tier)).toEqual(["system", "runtime", "system"]);
  });

  it("uses environment as the source when a non-blank env value is present", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      role: "super_admin",
    });

    const result = await listAdminSystemConfig({
      DATABASE_URL: "file:./data/prod.db",
      AI_MODEL_TEXT: "",
    } as NodeJS.ProcessEnv);

    expect(result).toEqual([
      expect.objectContaining({
        name: "DATABASE_URL",
        value: "file:./data/prod.db",
        source: "environment",
      }),
      expect.objectContaining({
        name: "AI_MODEL_TEXT",
        value: "gpt-4o-mini",
        source: "default",
      }),
      expect.objectContaining({
        name: "AUTH_SECRET",
        value: null,
        source: "missing",
      }),
    ]);
  });

  it("falls back to default when env is blank or missing", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      role: "super_admin",
    });

    const result = await listAdminSystemConfig({
      DATABASE_URL: "   ",
    } as NodeJS.ProcessEnv);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "DATABASE_URL",
          value: "file:./data/sqlite.db",
          source: "default",
        }),
        expect.objectContaining({
          name: "AI_MODEL_TEXT",
          value: "gpt-4o-mini",
          source: "default",
        }),
      ])
    );
  });

  it("marks rows without env and without default as missing", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      role: "super_admin",
    });

    const result = await listAdminSystemConfig({} as NodeJS.ProcessEnv);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "AUTH_SECRET",
          value: null,
          source: "missing",
        }),
      ])
    );
  });
});
