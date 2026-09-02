import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { LedgerPort } from "@/application/contracts";
import { db } from "@/lib/db";
import { ConflictError } from "@/lib/errors";
import {
  entryCategories,
  ledgerEntries,
  ledgers,
  objectCleanupJobs,
  processingAttempts,
  processingOutbox,
  duplicateReviews,
  revisionFiles,
  serviceCredentials,
  sourceDocuments,
  sourceDocumentRevisions,
  storedFiles,
  uploadSessionFiles,
} from "@/persistence";

import { mapLedgerSettings, settingsColumns } from "./shared";

export const postgresLedgerAdapter: LedgerPort = {
  async isOwnedByUser(ledgerId, userId) {
    const row = await db
      .select({ id: ledgers.id })
      .from(ledgers)
      .where(and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId), isNull(ledgers.deletedAt)))
      .limit(1);
    return row.length === 1;
  },

  async getOwned(ledgerId, userId) {
    const row = await db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
    });
    return row == null
      ? null
      : {
          id: row.id,
          userId: row.userId,
          settings: mapLedgerSettings(row),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
  },
  async listIdsForUser(userId) {
    const rows = await db
      .select({ id: ledgers.id })
      .from(ledgers)
      .where(and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)))
      .orderBy(desc(ledgers.createdAt));
    return rows.map((row) => row.id);
  },
  async listForUser(userId) {
    const rows = await db.query.ledgers.findMany({
      where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
      orderBy: [desc(ledgers.createdAt)],
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      settings: mapLedgerSettings(row),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  },
  async createDefault(input) {
    try {
      return db.transaction(async (tx) => {
        const row = await tx
          .insert(ledgers)
          .values({ userId: input.userId, ...settingsColumns(input.settings) })
          .returning()
          .then((rows) => rows[0]);
        if (row == null) throw new ConflictError("Failed to create ledger");
        if (input.categories.length > 0) {
          await tx
            .insert(entryCategories)
            .values(input.categories.map((category) => ({ ...category, ledgerId: row.id })));
        }
        return {
          id: row.id,
          userId: row.userId,
          settings: mapLedgerSettings(row),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "23505" &&
        "constraint" in error &&
        error.constraint === "uniq_ledgers_user_id"
      ) {
        throw new ConflictError("User already has an active ledger");
      }
      throw error;
    }
  },
  async deleteOwned(ledgerId, userId) {
    return db.transaction(async (tx) => {
      const row = await tx
        .select()
        .from(ledgers)
        .where(eq(ledgers.id, ledgerId))
        .for("update")
        .then((rows) => rows[0]);
      if (row == null) return "not_found" as const;
      if (row.userId !== userId) return "not_found" as const;
      if (row.deletedAt != null) return "already_deleted" as const;
      const now = new Date();
      await tx
        .update(sourceDocumentRevisions)
        .set({ outcome: "cancelled", finalizedAt: now })
        .where(
          and(
            eq(sourceDocumentRevisions.ledgerId, ledgerId),
            eq(sourceDocumentRevisions.outcome, "processing")
          )
        );
      await tx
        .update(processingOutbox)
        .set({
          status: "cancelled",
          completedAt: now,
          claimToken: null,
          claimedAt: null,
          claimExpiresAt: null,
        })
        .where(
          and(
            eq(processingOutbox.ledgerId, ledgerId),
            inArray(processingOutbox.status, ["pending", "claimed"])
          )
        );
      await tx
        .update(processingAttempts)
        .set({ status: "cancelled", completedAt: now })
        .where(
          and(
            eq(processingAttempts.ledgerId, ledgerId),
            inArray(processingAttempts.status, ["queued", "processing"])
          )
        );
      await tx
        .update(duplicateReviews)
        .set({ status: "discarded", decision: "superseded", decidedAt: now, updatedAt: now })
        .where(
          and(
            eq(duplicateReviews.ledgerId, ledgerId),
            inArray(duplicateReviews.status, ["pending", "staged"])
          )
        );
      await tx
        .update(ledgerEntries)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)));
      await tx
        .update(entryCategories)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)));
      await tx
        .update(sourceDocuments)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(sourceDocuments.ledgerId, ledgerId), isNull(sourceDocuments.deletedAt)));
      await tx
        .update(serviceCredentials)
        .set({ deletedAt: now })
        .where(
          and(eq(serviceCredentials.ledgerId, ledgerId), isNull(serviceCredentials.deletedAt))
        );
      const files = await tx
        .select({ storageKey: storedFiles.storageKey })
        .from(storedFiles)
        .where(eq(storedFiles.ledgerId, ledgerId));
      if (files.length > 0) {
        await tx
          .insert(objectCleanupJobs)
          .values(files.map((file) => ({ storageKey: file.storageKey })))
          .onConflictDoNothing();
      }
      await tx.delete(revisionFiles).where(eq(revisionFiles.ledgerId, ledgerId));
      await tx.delete(uploadSessionFiles).where(eq(uploadSessionFiles.ledgerId, ledgerId));
      await tx.delete(storedFiles).where(eq(storedFiles.ledgerId, ledgerId));
      await tx
        .update(ledgers)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(ledgers.id, ledgerId));
      return "deleted" as const;
    });
  },
};
