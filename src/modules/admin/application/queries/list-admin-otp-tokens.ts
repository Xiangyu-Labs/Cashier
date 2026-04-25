import { and, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminOTPTokensInput } from "@/modules/admin/contract-schemas";
import type {
  AdminOTPTokenListItem,
  ListAdminOTPTokensInput,
  ListAdminOTPTokensResult,
} from "@/modules/admin/contracts";
import { otpTokens } from "@/persistence";

function parseOTPTokenCursor(cursor: string): { createdAt: Date; id: string } {
  const [createdAtRaw, id, ...rest] = cursor.split("|");
  if (rest.length > 0 || createdAtRaw == null || createdAtRaw === "" || id == null || id === "") {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin OTP token cursor", path: ["cursor"] }],
    });
  }
  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError("Validation failed", {
      issues: [{ message: "Invalid admin OTP token cursor", path: ["cursor"] }],
    });
  }
  return { createdAt, id };
}

function formatOTPTokenCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

export async function listAdminOTPTokens(
  input: ListAdminOTPTokensInput = {}
): Promise<ListAdminOTPTokensResult> {
  await requireSuperAdmin();

  const validated = parseListAdminOTPTokensInput(input);
  const conditions: (ReturnType<typeof eq> | ReturnType<typeof isNotNull> | ReturnType<typeof isNull>)[] = [];
  const parsedCursor = validated.cursor != null ? parseOTPTokenCursor(validated.cursor) : null;

  if (validated.email != null) {
    conditions.push(eq(otpTokens.email, validated.email));
  }

  if (validated.verified === "yes") {
    conditions.push(isNotNull(otpTokens.verifiedAt));
  } else if (validated.verified === "no") {
    conditions.push(isNull(otpTokens.verifiedAt));
  }

  if (parsedCursor != null) {
    const cursorCondition = or(
      lt(otpTokens.createdAt, parsedCursor.createdAt),
      and(eq(otpTokens.createdAt, parsedCursor.createdAt), lt(otpTokens.id, parsedCursor.id))
    );
    if (cursorCondition != null) {
      conditions.push(cursorCondition);
    }
  }

  const rows = await db
    .select({
      id: otpTokens.id,
      email: otpTokens.email,
      tokenHash: otpTokens.tokenHash,
      expires: otpTokens.expires,
      attempts: otpTokens.attempts,
      lockedUntil: otpTokens.lockedUntil,
      ipAddress: otpTokens.ipAddress,
      createdAt: otpTokens.createdAt,
      lastAttemptAt: otpTokens.lastAttemptAt,
      verifiedAt: otpTokens.verifiedAt,
    })
    .from(otpTokens)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(otpTokens.createdAt), desc(otpTokens.id))
    .limit(validated.limit + 1);

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > validated.limit) {
    pageRows = rows.slice(0, validated.limit);
    const lastItem = pageRows[pageRows.length - 1];
    if (lastItem != null) {
      nextCursor = formatOTPTokenCursor(lastItem);
    }
  }

  const anyTokenRows = await db.select({ count: sql<number>`count(*)` }).from(otpTokens);

  const items: AdminOTPTokenListItem[] = pageRows.map((row) => ({
    id: row.id,
    email: row.email,
    expires: row.expires,
    attempts: row.attempts,
    isVerified: row.verifiedAt != null,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
  }));

  return {
    items,
    nextCursor,
    hasAnyOTPTokens: (anyTokenRows[0]?.count ?? 0) > 0,
  };
}
