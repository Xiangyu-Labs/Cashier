import { APP_ENV_CATALOG } from "@/lib/env/catalog";
import { requireSuperAdmin } from "@/modules/admin/access";
import type {
  AdminSystemConfigItem,
  AdminSystemConfigSource,
} from "@/modules/admin/contracts";

function resolveConfigValue(
  rawValue: string | undefined,
  defaultValue: string | null
): { value: string | null; source: AdminSystemConfigSource } {
  if (rawValue != null && rawValue.trim() !== "") {
    return { value: rawValue, source: "environment" };
  }

  if (defaultValue != null) {
    return { value: defaultValue, source: "default" };
  }

  return { value: null, source: "missing" };
}

export async function listAdminSystemConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<AdminSystemConfigItem[]> {
  await requireSuperAdmin();

  return APP_ENV_CATALOG.flatMap((entry) => {
    if (entry.tier === "frontend") {
      return [];
    }

    const { value, source } = resolveConfigValue(env[entry.name], entry.defaultValue);

    return [
      {
        name: entry.name,
        tier: entry.tier,
        required: entry.required,
        description: entry.description,
        value,
        source,
      } satisfies AdminSystemConfigItem,
    ];
  });
}
