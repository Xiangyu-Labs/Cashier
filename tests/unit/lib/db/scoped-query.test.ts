import { describe, it, expect } from "vitest";
import { forLedger } from "@/lib/db/scoped-query";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { SQL } from "drizzle-orm";

// Create a test table that mimics the structure of real tables
const testTable = sqliteTable("test_entities", {
    id: text("id").primaryKey(),
    ledgerId: text("ledger_id").notNull(),
    name: text("name"),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

// Create a table without deletedAt to test conditional logic
const tableWithoutSoftDelete = sqliteTable("no_soft_delete", {
    id: text("id").primaryKey(),
    ledgerId: text("ledger_id").notNull(),
    name: text("name"),
});

describe("forLedger", () => {
    const TEST_LEDGER_ID = "test-ledger-123";

    it("should return an object with required methods", () => {
        const scope = forLedger(testTable, TEST_LEDGER_ID);

        expect(scope).toHaveProperty("whereActive");
        expect(scope).toHaveProperty("whereId");
        expect(scope).toHaveProperty("softDelete");
        expect(scope).toHaveProperty("ledgerId");
    });

    it("should store the ledgerId", () => {
        const scope = forLedger(testTable, TEST_LEDGER_ID);
        expect(scope.ledgerId).toBe(TEST_LEDGER_ID);
    });

    it("should return a SQL condition for whereActive", () => {
        const scope = forLedger(testTable, TEST_LEDGER_ID);
        const condition = scope.whereActive;

        expect(condition).toBeDefined();
        expect(condition).toBeInstanceOf(SQL);
    });

    it("should return a SQL condition for whereId", () => {
        const scope = forLedger(testTable, TEST_LEDGER_ID);
        const condition = scope.whereId("entity-123");

        expect(condition).toBeDefined();
        expect(condition).toBeInstanceOf(SQL);
    });

    it("should return softDelete object with deletedAt", () => {
        const scope = forLedger(testTable, TEST_LEDGER_ID);
        const softDelete = scope.softDelete;

        expect(softDelete).toHaveProperty("deletedAt");
        expect(softDelete.deletedAt).toBeInstanceOf(Date);
    });

    it("should work with tables that have deletedAt column", () => {
        const scope = forLedger(testTable, TEST_LEDGER_ID);

        // Should not throw
        expect(() => scope.whereActive).not.toThrow();
        expect(() => scope.whereId("test-id")).not.toThrow();
    });

    it("should work with tables without deletedAt column", () => {
        const scope = forLedger(tableWithoutSoftDelete, TEST_LEDGER_ID);

        // Should not throw
        expect(() => scope.whereActive).not.toThrow();
        expect(() => scope.whereId("test-id")).not.toThrow();
    });

    it("should create different scopes for different ledgerIds", () => {
        const scope1 = forLedger(testTable, "ledger-1");
        const scope2 = forLedger(testTable, "ledger-2");

        expect(scope1.ledgerId).toBe("ledger-1");
        expect(scope2.ledgerId).toBe("ledger-2");
        expect(scope1.ledgerId).not.toBe(scope2.ledgerId);
    });

    it("should generate whereActive as a getter (not a function)", () => {
        const scope = forLedger(testTable, TEST_LEDGER_ID);

        // whereActive should be a property, not a method
        expect(typeof scope.whereActive).toBe("object");
        expect(scope.whereActive).toBeInstanceOf(SQL);
    });

    it("should generate softDelete as a getter (not a function)", () => {
        const scope = forLedger(testTable, TEST_LEDGER_ID);

        // softDelete should be a property
        expect(typeof scope.softDelete).toBe("object");
        expect(scope.softDelete).toHaveProperty("deletedAt");
    });

    it("should generate whereId as a function", () => {
        const scope = forLedger(testTable, TEST_LEDGER_ID);

        // whereId should be a function
        expect(typeof scope.whereId).toBe("function");
    });

    it("should produce valid SQL for different IDs", () => {
        const scope = forLedger(testTable, TEST_LEDGER_ID);

        const condition1 = scope.whereId("id-1");
        const condition2 = scope.whereId("id-2");

        expect(condition1).toBeInstanceOf(SQL);
        expect(condition2).toBeInstanceOf(SQL);
        // Each call should produce a distinct SQL object
        expect(condition1).not.toBe(condition2);
    });
});
