import { and, eq, isNull } from "drizzle-orm";
import type { UserAccountPort, UserPreferencesPort } from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError } from "@/lib/errors";
import { users } from "@/persistence";
import { normalizeUserPreferences } from "@/modules/auth/services/user-preferences";
import { normalizeEmail } from "@/lib/utils/email";

export const postgresUserAccountAdapter: UserAccountPort = {
  async findOrCreate(email, name) {
    const normalizedEmail = normalizeEmail(email);
    return db.transaction(async (tx) => {
      const created = await tx
        .insert(users)
        .values({
          email: normalizedEmail,
          ...(name === undefined ? {} : { name }),
          emailVerified: new Date(),
        })
        .onConflictDoNothing()
        .returning()
        .then((rows) => rows[0]);
      const row =
        created ??
        (await tx
          .select()
          .from(users)
          .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
          .then((rows) => rows[0]));
      if (row == null) throw new ConflictError("Failed to create user account");
      return {
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          image: row.image,
          passwordHash: row.passwordHash,
          passwordUpdatedAt: row.passwordUpdatedAt,
          authVersion: row.authVersion,
          registrationCompletedAt: row.registrationCompletedAt,
          interfaceLanguage: normalizeUserPreferences(row.preferences).interfaceLanguage,
        },
        isExistingUser: created == null,
      };
    });
  },
  async findByEmail(email) {
    const row = await db.query.users.findFirst({
      where: and(eq(users.email, email), isNull(users.deletedAt)),
      columns: {
        id: true,
        email: true,
        name: true,
        image: true,
        passwordHash: true,
        passwordUpdatedAt: true,
        authVersion: true,
        registrationCompletedAt: true,
        preferences: true,
      },
    });
    return row == null
      ? null
      : {
          id: row.id,
          email: row.email,
          name: row.name,
          image: row.image,
          passwordHash: row.passwordHash,
          passwordUpdatedAt: row.passwordUpdatedAt,
          authVersion: row.authVersion,
          registrationCompletedAt: row.registrationCompletedAt,
          interfaceLanguage: normalizeUserPreferences(row.preferences).interfaceLanguage,
        };
  },
  async findById(id) {
    const row = await db.query.users.findFirst({
      where: and(eq(users.id, id), isNull(users.deletedAt)),
      columns: {
        id: true,
        email: true,
        name: true,
        image: true,
        passwordHash: true,
        passwordUpdatedAt: true,
        authVersion: true,
        registrationCompletedAt: true,
        preferences: true,
      },
    });
    return row == null
      ? null
      : {
          id: row.id,
          email: row.email,
          name: row.name,
          image: row.image,
          passwordHash: row.passwordHash,
          passwordUpdatedAt: row.passwordUpdatedAt,
          authVersion: row.authVersion,
          registrationCompletedAt: row.registrationCompletedAt,
          interfaceLanguage: normalizeUserPreferences(row.preferences).interfaceLanguage,
        };
  },
  async completeRegistration(userId, completedAt) {
    const updated = await db
      .update(users)
      .set({ registrationCompletedAt: completedAt, updatedAt: completedAt })
      .where(
        and(eq(users.id, userId), isNull(users.deletedAt), isNull(users.registrationCompletedAt))
      )
      .returning({ id: users.id });
    return updated.length === 1;
  },
};

export const postgresUserPreferencesAdapter: UserPreferencesPort = {
  async get(userId) {
    const row = await db.query.users.findFirst({
      where: and(eq(users.id, userId), isNull(users.deletedAt)),
      columns: { preferences: true },
    });
    return row == null ? null : normalizeUserPreferences(row.preferences);
  },

  async update(input) {
    const updated = await db
      .update(users)
      .set({ preferences: input.preferences, updatedAt: new Date() })
      .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
      .returning({ preferences: users.preferences })
      .then((rows) => rows[0]);
    return updated == null ? null : normalizeUserPreferences(updated.preferences);
  },
};
