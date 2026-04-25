import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminServiceCredentialsInput } from "@/modules/admin/contract-schemas";
import type {
  AdminServiceCredentialListItem,
  ListAdminServiceCredentialsInput,
  ListAdminServiceCredentialsResult,
} from "@/modules/admin/contracts";
import { ledgers, serviceCredentials, users } from "@/persistence";

function parseServiceCredentialCursor(cursor: string): { createdAt: Date; id: string } {
  const [createdAtRaw, id, ...rest] = cursor.split("|");
  if (rest.length > 0 || createdAtRaw == null || createdAtRaw === "" || id == null || id === "") {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin service credential cursor", path: ["cursor"] }],
    });
  }
  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin service credential cursor", path: ["cursor"] }],
    });
  }
  return { createdAt, id };
}

function formatServiceCredentialCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

export async function listAdminServiceCredentials(
  input: ListAdminServiceCredentialsInput = {}
): Promise<ListAdminServiceCredentialsResult> {
  await requireSuperAdmin();

  const validated = parseListAdminServiceCredentialsInput(input);
  const conditions = [isNull(serviceCredentials.deletedAt)];
  const parsedCursor = validated.cursor != null ? parseServiceCredentialCursor(validated.cursor) : null;

  if (validated.ledgerId != null) {
    conditions.push(eq(serviceCredentials.ledgerId, validated.ledgerId));
  }

  if (parsedCursor != null) {
    const cursorCondition = or(
      lt(serviceCredentials.createdAt, parsedCursor.createdAt),
      and(
        eq(serviceCredentials.createdAt, parsedCursor.createdAt),
        lt(serviceCredentials.id, parsedCursor.id)
      )
    );
    if (cursorCondition != null) {
      conditions.push(cursorCondition);
    }
  }

  const rows = await db
    .select({
      id: serviceCredentials.id,
      key: serviceCredentials.key,
      name: serviceCredentials.name,
      ledgerId: serviceCredentials.ledgerId,
      userEmail: users.email,
      createdAt: serviceCredentials.createdAt,
      lastUsedAt: serviceCredentials.lastUsedAt,
    })
    .from(serviceCredentials)
    .leftJoin(ledgers, and(eq(serviceCredentials.ledgerId, ledgers.id), isNull(ledgers.deletedAt)))
    .leftJoin(users, and(eq(ledgers.userId, users.id), isNull(users.deletedAt)))
    .where(and(...conditions))
    .orderBy(desc(serviceCredentials.createdAt), desc(serviceCredentials.id))
    .limit(validated.limit + 1);

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > validated.limit) {
    pageRows = rows.slice(0, validated.limit);
    const lastItem = pageRows[pageRows.length - 1];
    if (lastItem != null) {
      nextCursor = formatServiceCredentialCursor(lastItem);
    }
  }

  const anyCredentialRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(serviceCredentials)
    .where(isNull(serviceCredentials.deletedAt));

  const items: AdminServiceCredentialListItem[] = pageRows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    ledgerId: row.ledgerId,
    userEmail: row.userEmail,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  }));

  return {
    items,
    nextCursor,
    hasAnyServiceCredentials: (anyCredentialRows[0]?.count ?? 0) > 0,
  };
}
