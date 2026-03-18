import { relations } from "drizzle-orm";
import { users, accounts } from "./schema/auth";
import {
  ledgers,
  entryCategories,
  ledgerEntries,
  serviceCredentials,
} from "./schema/ledger";
import { sourceDocuments } from "./schema/source-document";

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  ledgers: many(ledgers),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const ledgersRelations = relations(ledgers, ({ one, many }) => ({
  user: one(users, {
    fields: [ledgers.userId],
    references: [users.id],
  }),
  ledgerEntries: many(ledgerEntries),
  sourceDocuments: many(sourceDocuments),
  entryCategories: many(entryCategories),
  serviceCredentials: many(serviceCredentials),
}));

export const entryCategoriesRelations = relations(entryCategories, ({ one, many }) => ({
  ledger: one(ledgers, {
    fields: [entryCategories.ledgerId],
    references: [ledgers.id],
  }),
  ledgerEntries: many(ledgerEntries),
}));

export const sourceDocumentsRelations = relations(sourceDocuments, ({ one, many }) => ({
  ledger: one(ledgers, {
    fields: [sourceDocuments.ledgerId],
    references: [ledgers.id],
  }),
  ledgerEntries: many(ledgerEntries),
}));

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
