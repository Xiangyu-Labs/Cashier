import { relations } from "drizzle-orm";
import { users, accounts, sessions } from "@/features/auth/server/schema";
import { ledgers, entryCategories, ledgerEntries, serviceCredentials } from "@/features/ledger/server/schema";
import { taskRuns } from "@/features/tasks/server/schema";
import { sourceDocuments, sourceDocumentStatusEnum, anomalyCodeEnum } from "@/features/source-document/server/schema";

// Auth relations
export const usersRelations = relations(users, ({ many }) => ({
    accounts: many(accounts),
    sessions: many(sessions),
    ledgers: many(ledgers),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
    user: one(users, {
        fields: [accounts.userId],
        references: [users.id],
    }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(users, {
        fields: [sessions.userId],
        references: [users.id],
    }),
}));

// Business relations
export const ledgersRelations = relations(ledgers, ({ one, many }) => ({
    user: one(users, {
        fields: [ledgers.userId],
        references: [users.id],
    }),
    ledgerEntries: many(ledgerEntries),
    sourceDocuments: many(sourceDocuments),
}));

export const entryCategoriesRelations = relations(entryCategories, ({ one, many }) => ({
    ledger: one(ledgers, {
        fields: [entryCategories.ledgerId],
        references: [ledgers.id],
    }),
    ledgerEntries: many(ledgerEntries),
}));

export const sourceDocumentsRelations = relations(
    sourceDocuments,
    ({ one, many }) => ({
        ledger: one(ledgers, {
            fields: [sourceDocuments.ledgerId],
            references: [ledgers.id],
        }),
        ledgerEntries: many(ledgerEntries),
    })
);


export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
    ledger: one(ledgers, {
        fields: [ledgerEntries.ledgerId],
        references: [ledgers.id],
    }),
    category: one(entryCategories, {
        fields: [ledgerEntries.categoryId],
        references: [entryCategories.id],
    }),
    sourceDocument: one(sourceDocuments, {
        fields: [ledgerEntries.sourceDocumentId],
        references: [sourceDocuments.id],
    }),
}));

export const serviceCredentialsRelations = relations(serviceCredentials, ({ one }) => ({
    ledger: one(ledgers, {
        fields: [serviceCredentials.ledgerId],
        references: [ledgers.id],
    }),
}));

export const taskRunsRelations = relations(taskRuns, ({ one }) => ({
    ledger: one(ledgers, {
        fields: [taskRuns.ledgerId],
        references: [ledgers.id],
    }),
}));
