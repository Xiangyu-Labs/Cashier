import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailChangeChallenges, users } from "@/persistence";
import type { AccountSecurityPort } from "@/modules/auth/application/ports";
import { verificationChallenges } from "@/modules/auth/services/verification-challenge";

export const postgresAccountSecurityAdapter: AccountSecurityPort = {
  async getPasswordHash(userId) {
    const user = await db.query.users.findFirst({
      where: and(eq(users.id, userId), isNull(users.deletedAt)),
      columns: { passwordHash: true },
    });
    return user?.passwordHash;
  },

  async setInitialPassword(input) {
    const updated = await db
      .update(users)
      .set({
        passwordHash: input.passwordHash,
        passwordUpdatedAt: input.passwordUpdatedAt,
        updatedAt: input.passwordUpdatedAt,
      })
      .where(and(eq(users.id, input.userId), isNull(users.deletedAt), isNull(users.passwordHash)))
      .returning({ id: users.id });
    return updated.length === 1;
  },

  async changePassword(input) {
    const updated = await db
      .update(users)
      .set({
        passwordHash: input.passwordHash,
        passwordUpdatedAt: input.passwordUpdatedAt,
        updatedAt: input.passwordUpdatedAt,
      })
      .where(
        and(
          eq(users.id, input.userId),
          isNull(users.deletedAt),
          eq(users.passwordHash, input.expectedPasswordHash)
        )
      )
      .returning({ id: users.id });
    return updated.length === 1;
  },

  async createEmailChangeChallenge(input) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select id from users where id = ${input.userId} for update`);
      const current = await tx.query.users.findFirst({
        where: and(eq(users.id, input.userId), isNull(users.deletedAt)),
        columns: { email: true },
      });
      const duplicate = await tx.query.users.findFirst({
        where: and(
          eq(users.email, input.newEmail),
          ne(users.id, input.userId),
          isNull(users.deletedAt)
        ),
        columns: { id: true },
      });
      const existing = await tx.query.emailChangeChallenges.findFirst({
        where: eq(emailChangeChallenges.userId, input.userId),
        columns: { createdAt: true },
      });
      if (current == null) return "unauthorized" as const;
      if (current.email === input.newEmail) return "same_email" as const;
      if (duplicate != null) return "duplicate" as const;
      if (
        existing != null &&
        input.now.getTime() - existing.createdAt.getTime() < input.minimumIntervalMs
      ) {
        return "rate_limited" as const;
      }
      await tx
        .insert(emailChangeChallenges)
        .values({
          userId: input.userId,
          newEmail: input.newEmail,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdAt: input.now,
        })
        .onConflictDoUpdate({
          target: emailChangeChallenges.userId,
          set: {
            newEmail: input.newEmail,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            attempts: 0,
            lockedUntil: null,
            createdAt: input.now,
            lastAttemptAt: null,
          },
        });
      return "created" as const;
    });
  },

  async discardEmailChangeChallenge(input) {
    await db
      .delete(emailChangeChallenges)
      .where(
        and(
          eq(emailChangeChallenges.userId, input.userId),
          eq(emailChangeChallenges.newEmail, input.newEmail),
          eq(emailChangeChallenges.tokenHash, input.tokenHash)
        )
      );
  },

  async verifyEmailChangeChallenge(input) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from email_change_challenges where user_id = ${input.userId} for update`
      );
      const challenge = await tx.query.emailChangeChallenges.findFirst({
        where: and(
          eq(emailChangeChallenges.userId, input.userId),
          eq(emailChangeChallenges.newEmail, input.newEmail)
        ),
      });
      if (challenge == null) return { status: "not_found" as const };
      const check = verificationChallenges.check(challenge, input.otp, input.now);
      if (!check.ok && check.reason === "locked") return { status: "locked" as const };
      if (!check.ok && check.reason === "expired") return { status: "expired" as const };
      if (!check.ok) {
        const failure = verificationChallenges.nextFailure(challenge.attempts);
        await tx
          .update(emailChangeChallenges)
          .set({
            attempts: failure.attempts,
            lockedUntil: failure.lockedUntil,
            lastAttemptAt: input.now,
          })
          .where(eq(emailChangeChallenges.id, challenge.id));
        return {
          status: "incorrect" as const,
          locked: failure.lockedUntil != null,
          attemptsRemaining: failure.attemptsRemaining,
        };
      }
      const duplicate = await tx.query.users.findFirst({
        where: and(
          eq(users.email, input.newEmail),
          ne(users.id, input.userId),
          isNull(users.deletedAt)
        ),
        columns: { id: true },
      });
      if (duplicate != null) return { status: "duplicate" as const };
      await tx
        .update(users)
        .set({ email: input.newEmail, emailVerified: input.now, updatedAt: input.now })
        .where(and(eq(users.id, input.userId), isNull(users.deletedAt)));
      await tx.delete(emailChangeChallenges).where(eq(emailChangeChallenges.id, challenge.id));
      return { status: "verified" as const, email: input.newEmail };
    });
  },
};
